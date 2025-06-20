import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<WebSocketMessage>();
  private connectionSubject = new BehaviorSubject<boolean>(false);

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private reconnectTimer: any = null;

  private readonly serverUrl = this.getServerUrl();

  constructor() {}

  private getServerUrl(): string {
    // Em desenvolvimento, usar localhost
    if (this.isElectron() && (window as any).electronAPI) {
      return 'ws://localhost:3000';
    }

    // Em produção, usar URL da nuvem
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'ws://localhost:3000';
    }

    // URL da nuvem quando em produção
    return `wss://${host.replace('http://', '').replace('https://', '')}`;
  }

  private isElectron(): boolean {
    return !!(window as any).electronAPI;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.serverUrl);        this.socket.onopen = (event) => {
          // console.log('🌐 WebSocket conectado');
          this.connectionSubject.next(true);
          this.reconnectAttempts = 0;

          // Enviar ping para testar conexão
          this.send({ type: 'ping' });
          resolve();
        };        this.socket.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            // console.log('📨 Mensagem recebida:', message);
            this.messageSubject.next(message);
          } catch (error) {
            console.error('Erro ao parsear mensagem WebSocket:', error);
          }
        };

        this.socket.onclose = (event) => {
          // console.log('🔌 WebSocket desconectado:', event.code, event.reason);
          this.connectionSubject.next(false);
          this.socket = null;

          // Tentar reconectar se não foi fechamento manual
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.socket.onerror = (error) => {
          console.error('❌ Erro no WebSocket:', error);
          reject(new Error('Falha ao conectar no servidor'));
        };

        // Timeout para conexão
        setTimeout(() => {
          if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
            this.socket.close();
            reject(new Error('Timeout na conexão WebSocket'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1); // Backoff exponencial    // console.log(`🔄 Tentando reconectar em ${delay}ms (tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('Falha na reconexão:', error);
      }
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close(1000, 'Desconexão manual');
      this.socket = null;
    }

    this.connectionSubject.next(false);
  }
  private send(message: WebSocketMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {      // console.log('📤 Enviando mensagem WebSocket:', message);
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ WebSocket não está conectado, mensagem ignorada:', message);
    }
  }// Métodos públicos para interagir com o matchmaking
  async joinQueue(player: any, preferences?: any): Promise<void> {
    this.send({
      type: 'join_queue',
      data: {
        player,
        preferences
      }
    });
  }

  async leaveQueue(): Promise<void> {
    this.send({
      type: 'leave_queue'
    });
  }

  requestQueueStatus(): void {
    this.send({
      type: 'get_queue_status'
    });
  }

  sendChatMessage(message: string): void {
    this.send({
      type: 'chat_message',
      data: { message }
    });
  }

  acceptMatch(matchId: number): void {
    this.send({
      type: 'accept_match',
      data: { matchId }
    });
  }

  declineMatch(matchId: number): void {
    this.send({
      type: 'decline_match',
      data: { matchId }
    });
  }

  reportMatchResult(matchId: number, won: boolean): void {
    this.send({
      type: 'match_result',
      data: { matchId, won }
    });
  }

  // Observables para componentes se inscreverem
  onMessage(): Observable<WebSocketMessage> {
    return this.messageSubject.asObservable();
  }

  onConnectionChange(): Observable<boolean> {
    return this.connectionSubject.asObservable();
  }

  isConnected(): boolean {
    return this.connectionSubject.value;
  }

  getConnectionState(): 'connecting' | 'connected' | 'disconnected' | 'error' {
    if (!this.socket) return 'disconnected';

    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'error';
    }
  }

  // Método para testar conexão
  ping(): void {
    this.send({ type: 'ping' });
  }

  // Cleanup
  ngOnDestroy(): void {
    this.disconnect();
  }
}
