import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
    providedIn: 'root'
})
export class ProfileIconService {
    private profileIconCache: Map<string, number> = new Map();
    private profileIconsCacheKey = 'shared_profile_icons_cache';
    private cacheVersion = '1.0.0';

    constructor(private http: HttpClient) {
        this.loadProfileIconsCache();
    }

    /**
     * Obtém a URL do ícone de perfil para um jogador
     * @param summonerName - Nome do summoner
     * @param riotIdGameName - Nome do Riot ID (opcional)
     * @param riotIdTagline - Tag do Riot ID (opcional)
     * @returns URL do ícone de perfil
     */
    getProfileIconUrl(summonerName: string, riotIdGameName?: string, riotIdTagline?: string): string {
        const profileIconId = this.getProfileIconId(summonerName, riotIdGameName, riotIdTagline);
        const iconId = profileIconId || 29; // Fallback para ícone padrão
        return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;
    }

    /**
     * Obtém o ID do ícone de perfil do cache ou busca do servidor
     * @param summonerName - Nome do summoner
     * @param riotIdGameName - Nome do Riot ID (opcional)
     * @param riotIdTagline - Tag do Riot ID (opcional)
     * @returns ID do ícone de perfil ou undefined se não encontrado
     */
    getProfileIconId(summonerName: string, riotIdGameName?: string, riotIdTagline?: string): number | undefined {
        // Tentar primeiro com Riot ID se disponível
        if (riotIdGameName && riotIdTagline) {
            const riotId = `${riotIdGameName}#${riotIdTagline}`;
            const cachedIconId = this.profileIconCache.get(riotId);
            if (cachedIconId) {
                return cachedIconId;
            }
        }

        // Fallback para summoner name
        return this.profileIconCache.get(summonerName);
    }

    /**
     * Busca o ícone de perfil do servidor e atualiza o cache
     * @param summonerName - Nome do summoner
     * @param riotIdGameName - Nome do Riot ID (opcional)
     * @param riotIdTagline - Tag do Riot ID (opcional)
     * @returns Promise com o ID do ícone ou null se não encontrado
     */
    async fetchProfileIcon(summonerName: string, riotIdGameName?: string, riotIdTagline?: string): Promise<number | null> {
        let riotId = summonerName;

        // Usar Riot ID se disponível
        if (riotIdGameName && riotIdTagline) {
            riotId = `${riotIdGameName}#${riotIdTagline}`;
        }

        try {
            const response = await this.http.get<any>(`http://localhost:3000/api/summoner/profile-icon/${encodeURIComponent(riotId)}`).toPromise();
            if (response.success && response.data.profileIconId !== undefined) {
                const profileIconId = response.data.profileIconId;

                // Salvar no cache
                this.profileIconCache.set(riotId, profileIconId);
                if (riotId !== summonerName) {
                    this.profileIconCache.set(summonerName, profileIconId);
                }

                // Salvar cache no localStorage
                this.saveProfileIconsCache();

                return profileIconId;
            }
            return null;
        } catch (error: any) {
            if (error.status === 404) {
                console.log(`ℹ️ Jogador ${riotId} não encontrado no LCU`);
            } else if (error.status === 503) {
                console.log(`⚠️ Cliente do LoL não conectado para buscar ${riotId}`);
            } else {
                console.warn(`Erro ao buscar profile icon para ${riotId}:`, error);
            }
            return null;
        }
    }

    /**
     * Obtém ou busca o ícone de perfil, garantindo que está no cache
     * @param summonerName - Nome do summoner
     * @param riotIdGameName - Nome do Riot ID (opcional)
     * @param riotIdTagline - Tag do Riot ID (opcional)
     * @returns Promise com o ID do ícone ou null se não encontrado
     */
    async getOrFetchProfileIcon(summonerName: string, riotIdGameName?: string, riotIdTagline?: string): Promise<number | null> {
        // Verificar se já está no cache
        const cachedIconId = this.getProfileIconId(summonerName, riotIdGameName, riotIdTagline);
        if (cachedIconId) {
            return cachedIconId;
        }

        // Se não está no cache, buscar do servidor
        return this.fetchProfileIcon(summonerName, riotIdGameName, riotIdTagline);
    }

    /**
     * Handler para erro de carregamento de imagem
     * @param event - Evento de erro da imagem
     * @param profileIconId - ID do ícone de perfil (opcional)
     */
    onProfileIconError(event: Event, profileIconId?: number): void {
        const target = event.target as HTMLImageElement;
        if (!target) return;

        const iconId = profileIconId || 29;
        const fallbackUrls = [
            `https://ddragon.leagueoflegends.com/cdn/15.13.1/img/profileicon/${iconId}.png`,
            `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${iconId}.png`,
            `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${iconId}.png`,
            `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/29.jpg`,
            '/assets/images/champion-placeholder.svg' // Fallback final para minion
        ];

        const currentSrc = target.src;
        let nextIndex = 0;

        for (let i = 0; i < fallbackUrls.length; i++) {
            if (fallbackUrls[i] === currentSrc) {
                nextIndex = i + 1;
                break;
            }
        }

        if (nextIndex < fallbackUrls.length) {
            target.src = fallbackUrls[nextIndex];
        }
    }

    /**
     * Carrega o cache de ícones do localStorage
     */
    private loadProfileIconsCache(): void {
        try {
            const iconsCache = localStorage.getItem(this.profileIconsCacheKey);
            if (iconsCache) {
                const iconsData = JSON.parse(iconsCache);
                if (iconsData.version === this.cacheVersion) {
                    this.profileIconCache = new Map(Object.entries(iconsData.icons));
                    console.log(`📦 Cache de ícones carregado: ${this.profileIconCache.size} ícones`);
                }
            }
        } catch (error) {
            console.warn('Erro ao carregar cache de ícones:', error);
        }
    }

    /**
     * Salva o cache de ícones no localStorage
     */
    private saveProfileIconsCache(): void {
        try {
            const iconsData = {
                icons: Object.fromEntries(this.profileIconCache),
                version: this.cacheVersion,
                timestamp: Date.now()
            };
            localStorage.setItem(this.profileIconsCacheKey, JSON.stringify(iconsData));
            console.log(`💾 Cache de ícones salvo: ${this.profileIconCache.size} ícones`);
        } catch (error) {
            console.warn('Erro ao salvar cache de ícones:', error);
        }
    }

    /**
     * Limpa o cache de ícones
     */
    clearCache(): void {
        this.profileIconCache.clear();
        localStorage.removeItem(this.profileIconsCacheKey);
        console.log('🗑️ Cache de ícones limpo');
    }
} 