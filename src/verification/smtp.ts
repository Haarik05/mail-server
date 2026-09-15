import * as net from 'net';
import { Logger } from '@nestjs/common';

export interface SmtpResult {
  code: number;
  message: string;
}

const logger = new Logger('SmtpEngine');

/**
 * A basic, promise-based SMTP client for verification.
 * Supports handling multiline SMTP responses and timeouts.
 */
export class SmtpClient {
  private socket: net.Socket;
  private responseBuffer: string = '';
  private commandQueue: Array<{
    resolve: (result: SmtpResult) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(
    private targetId: string,
    private timeoutMs: number = 5000,
  ) {
    this.socket = new net.Socket();
    this.socket.setTimeout(this.timeoutMs);

    this.socket.on('data', (data) => {
      const raw = data.toString('utf-8');
      logger.debug(`[${this.targetId}] Server -> ${raw.trim()}`);
      this.responseBuffer += raw;
      this.processBuffer();
    });

    this.socket.on('error', (err) => {
      logger.error(`[${this.targetId}] Socket error: ${err.message}`);
      this.failCurrentCommand(err);
    });

    this.socket.on('timeout', () => {
      logger.warn(
        `[${this.targetId}] Socket timeout reached (${this.timeoutMs}ms)`,
      );
      this.failCurrentCommand(new Error('SMTP socket timeout'));
      // A timeout on Port 25 should immediately severe the connection
      this.socket.destroy();
    });

    this.socket.on('close', () => {
      logger.debug(`[${this.targetId}] Socket closed`);
      this.failCurrentCommand(new Error('SMTP socket closed unexpectedly'));
    });
  }

  /**
   * Processes the data buffer looking for the complete end of an SMTP response.
   * SMTP dictates multiline responses use `250-message` vs `250 message` for the final line.
   */
  private processBuffer() {
    if (!this.responseBuffer.includes('\r\n')) return;

    // Check if the final flushed line has the valid end-of-response syntax (a space at index 3 instead of a dash).
    const lines = this.responseBuffer.split('\r\n');

    // Remember that split('\r\n') on a string ending in \r\n leaves an empty string '' as the last element.
    if (this.responseBuffer.endsWith('\r\n') && lines.length > 1) {
      const lastLine = lines[lines.length - 2];

      // '250 OK' (length >= 4, 3rd char is space)
      if (lastLine.length >= 4 && lastLine[3] === ' ') {
        const fullMessage = this.responseBuffer.trim();
        const code = parseInt(fullMessage.substring(0, 3), 10);

        this.responseBuffer = ''; // Clear buffer for next command

        const pending = this.commandQueue.shift();
        if (pending) {
          pending.resolve({ code, message: fullMessage });
        }
      }
    }
  }

  private failCurrentCommand(err: Error) {
    // Fails the current pending command and clears it.
    const pending = this.commandQueue.shift();
    if (pending) {
      pending.reject(err);
    }
  }

  public async connect(ip: string, port: number = 25): Promise<SmtpResult> {
    logger.debug(`[${this.targetId}] Connecting to ${ip}:${port}`);
    return new Promise((resolve, reject) => {
      this.commandQueue.push({ resolve, reject });
      this.socket.connect(port, ip);
    });
  }

  public async sendCommand(cmd: string): Promise<SmtpResult> {
    logger.debug(`[${this.targetId}] Client -> ${cmd}`);
    return new Promise((resolve, reject) => {
      this.commandQueue.push({ resolve, reject });
      this.socket.write(cmd + '\r\n');
    });
  }

  public async quit(): Promise<void> {
    if (!this.socket.destroyed && this.socket.writable) {
      // Fire and forget QUIT command, then destroy.
      await this.sendCommand('QUIT').catch(() => {});
    }
    this.socket.destroy();
  }
}

/**
 * Steps 7 & 8: SMTP Connection and Conversation
 * Orchestrates the full SMTP verification workflow for a specific mailbox.
 *
 * @param ip The mail server IP
 * @param targetEmail The email address to verify
 * @param myDomain Our application's sender domain, used for EHLO identifying
 */
export async function checkSmtpMailbox(
  ip: string,
  targetEmail: string,
  myDomain: string = 'verifier.local',
): Promise<SmtpResult> {
  const client = new SmtpClient(ip, 5000); // 5 sec timeout to avoid hanging processes
  let finalResult: SmtpResult;

  try {
    // 1. Connect (implicitly reads the server's 220 greeting)
    const connectRes = await client.connect(ip, 25);
    if (connectRes.code >= 400) {
      throw new Error(`Server denied connection: ${connectRes.message}`);
    }

    // 2. EHLO (Identify ourselves)
    const ehloRes = await client.sendCommand(`EHLO ${myDomain}`);
    if (ehloRes.code >= 400) {
      throw new Error(`EHLO rejected: ${ehloRes.message}`);
    }

    // 3. MAIL FROM (We specify a sender to test with)
    const mailFromRes = await client.sendCommand(
      `MAIL FROM:<verify@${myDomain}>`,
    );
    if (mailFromRes.code >= 400) {
      throw new Error(`MAIL FROM rejected: ${mailFromRes.message}`);
    }

    // 4. RCPT TO (The core step: we check if the target mailbox receives mail)
    finalResult = await client.sendCommand(`RCPT TO:<${targetEmail}>`);
  } catch (err: any) {
    // In case of TCP drop, TLS requirement, timeout, or flat out denial at EHLO.
    logger.warn(`[${ip}] SMTP conversation terminated early: ${err.message}`);
    finalResult = { code: 0, message: err.message };
  } finally {
    // Step 5: Always clean up TCP connections.
    await client.quit();
  }

  return finalResult;
}
