import { Injectable } from '@angular/core';

export interface Champion {
  id: string;
  key: string;
  name: string;
  title: string;
  image: string;
  tags: string[];
  info: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
}

export interface ChampionsByRole {
  top: Champion[];
  jungle: Champion[];
  mid: Champion[];
  adc: Champion[];
  support: Champion[];
  all: Champion[];
}

@Injectable({
  providedIn: 'root'
})
export class ChampionService {
  private baseImageUrl = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/';

  // Lista completa de campeões do LoL (atualizada para a temporada 15)
  private allChampions: Champion[] = [
    // Assassinos/Mid laners
    { id: '103', key: 'Ahri', name: 'Ahri', title: 'a Raposa de Nove Caudas', image: this.baseImageUrl + 'Ahri.png', tags: ['Assassin', 'Mage'], info: { attack: 3, defense: 4, magic: 8, difficulty: 5 } },
    { id: '84', key: 'Akali', name: 'Akali', title: 'a Assassina Renegada', image: this.baseImageUrl + 'Akali.png', tags: ['Assassin'], info: { attack: 5, defense: 3, magic: 8, difficulty: 7 } },
    { id: '34', key: 'Anivia', name: 'Anivia', title: 'a Criofênix', image: this.baseImageUrl + 'Anivia.png', tags: ['Mage'], info: { attack: 1, defense: 4, magic: 10, difficulty: 10 } },
    { id: '1', key: 'Annie', name: 'Annie', title: 'a Criança Sombria', image: this.baseImageUrl + 'Annie.png', tags: ['Mage'], info: { attack: 2, defense: 3, magic: 10, difficulty: 6 } },
    { id: '268', key: 'Azir', name: 'Azir', title: 'o Imperador de Shurima', image: this.baseImageUrl + 'Azir.png', tags: ['Mage', 'Marksman'], info: { attack: 6, defense: 3, magic: 8, difficulty: 9 } },
    { id: '136', key: 'AurelionSol', name: 'Aurelion Sol', title: 'o Forjador de Estrelas', image: this.baseImageUrl + 'AurelionSol.png', tags: ['Mage'], info: { attack: 2, defense: 3, magic: 8, difficulty: 7 } },
    { id: '13', key: 'Ryze', name: 'Ryze', title: 'o Mago Rúnico', image: this.baseImageUrl + 'Ryze.png', tags: ['Mage'], info: { attack: 2, defense: 2, magic: 10, difficulty: 7 } },
    { id: '4', key: 'TwistedFate', name: 'Twisted Fate', title: 'o Mestre das Cartas', image: this.baseImageUrl + 'TwistedFate.png', tags: ['Mage'], info: { attack: 6, defense: 2, magic: 6, difficulty: 9 } },
    { id: '7', key: 'LeBlanc', name: 'LeBlanc', title: 'a Ladina', image: this.baseImageUrl + 'Leblanc.png', tags: ['Assassin', 'Mage'], info: { attack: 1, defense: 4, magic: 10, difficulty: 9 } },
    { id: '238', key: 'Zed', name: 'Zed', title: 'o Mestre das Sombras', image: this.baseImageUrl + 'Zed.png', tags: ['Assassin'], info: { attack: 9, defense: 2, magic: 1, difficulty: 7 } },
    { id: '91', key: 'Talon', name: 'Talon', title: 'a Lâmina das Sombras', image: this.baseImageUrl + 'Talon.png', tags: ['Assassin'], info: { attack: 9, defense: 3, magic: 1, difficulty: 7 } },
    { id: '55', key: 'Katarina', name: 'Katarina', title: 'a Adaga Sinistra', image: this.baseImageUrl + 'Katarina.png', tags: ['Assassin', 'Mage'], info: { attack: 4, defense: 3, magic: 9, difficulty: 8 } },
    { id: '99', key: 'Lux', name: 'Lux', title: 'a Dama da Luz', image: this.baseImageUrl + 'Lux.png', tags: ['Mage', 'Support'], info: { attack: 2, defense: 4, magic: 10, difficulty: 5 } },
    { id: '25', key: 'Morgana', name: 'Morgana', title: 'a Anjo Caído', image: this.baseImageUrl + 'Morgana.png', tags: ['Mage', 'Support'], info: { attack: 1, defense: 6, magic: 8, difficulty: 1 } },
    { id: '90', key: 'Malzahar', name: 'Malzahar', title: 'o Profeta do Vazio', image: this.baseImageUrl + 'Malzahar.png', tags: ['Mage', 'Assassin'], info: { attack: 2, defense: 2, magic: 9, difficulty: 6 } },
    { id: '134', key: 'Syndra', name: 'Syndra', title: 'a Soberana Sombria', image: this.baseImageUrl + 'Syndra.png', tags: ['Mage'], info: { attack: 2, defense: 3, magic: 10, difficulty: 8 } },
    { id: '131', key: 'Diana', name: 'Diana', title: 'o Escárnio da Lua', image: this.baseImageUrl + 'Diana.png', tags: ['Fighter', 'Mage'], info: { attack: 7, defense: 6, magic: 8, difficulty: 4 } },
    { id: '245', key: 'Ekko', name: 'Ekko', title: 'o Garoto que Estilhaçou o Tempo', image: this.baseImageUrl + 'Ekko.png', tags: ['Assassin', 'Fighter'], info: { attack: 5, defense: 3, magic: 7, difficulty: 8 } },

    // Top laners/Fighters
    { id: '266', key: 'Aatrox', name: 'Aatrox', title: 'a Espada Darkin', image: this.baseImageUrl + 'Aatrox.png', tags: ['Fighter', 'Tank'], info: { attack: 8, defense: 4, magic: 3, difficulty: 4 } },
    { id: '122', key: 'Darius', name: 'Darius', title: 'a Mão de Noxus', image: this.baseImageUrl + 'Darius.png', tags: ['Fighter', 'Tank'], info: { attack: 9, defense: 5, magic: 1, difficulty: 2 } },
    { id: '86', key: 'Garen', name: 'Garen', title: 'o Poder de Demacia', image: this.baseImageUrl + 'Garen.png', tags: ['Fighter', 'Tank'], info: { attack: 7, defense: 8, magic: 1, difficulty: 5 } },
    { id: '24', key: 'Jax', name: 'Jax', title: 'o Grão-Mestre de Armas', image: this.baseImageUrl + 'Jax.png', tags: ['Fighter', 'Assassin'], info: { attack: 7, defense: 5, magic: 3, difficulty: 5 } },
    { id: '420', key: 'Illaoi', name: 'Illaoi', title: 'a Sacerdotisa do Kraken', image: this.baseImageUrl + 'Illaoi.png', tags: ['Fighter', 'Tank'], info: { attack: 8, defense: 6, magic: 3, difficulty: 4 } },
    { id: '39', key: 'Irelia', name: 'Irelia', title: 'a Dançarina das Lâminas', image: this.baseImageUrl + 'Irelia.png', tags: ['Fighter', 'Assassin'], info: { attack: 7, defense: 4, magic: 5, difficulty: 7 } },
    { id: '102', key: 'Shyvana', name: 'Shyvana', title: 'a Meio-Dragão', image: this.baseImageUrl + 'Shyvana.png', tags: ['Fighter', 'Tank'], info: { attack: 8, defense: 6, magic: 3, difficulty: 4 } },
    { id: '54', key: 'Malphite', name: 'Malphite', title: 'o Fragmento do Monólito', image: this.baseImageUrl + 'Malphite.png', tags: ['Tank', 'Fighter'], info: { attack: 5, defense: 9, magic: 7, difficulty: 2 } },
    { id: '57', key: 'Maokai', name: 'Maokai', title: 'o Ent Torturado', image: this.baseImageUrl + 'Maokai.png', tags: ['Tank', 'Mage'], info: { attack: 3, defense: 8, magic: 6, difficulty: 3 } },
    { id: '68', key: 'Rumble', name: 'Rumble', title: 'a Ameaça Mecânica', image: this.baseImageUrl + 'Rumble.png', tags: ['Fighter', 'Mage'], info: { attack: 3, defense: 6, magic: 8, difficulty: 10 } },
    { id: '98', key: 'Shen', name: 'Shen', title: 'o Olho do Crepúsculo', image: this.baseImageUrl + 'Shen.png', tags: ['Tank', 'Fighter'], info: { attack: 3, defense: 9, magic: 3, difficulty: 4 } },
    { id: '14', key: 'Sion', name: 'Sion', title: 'o Colosso Morto-Vivo', image: this.baseImageUrl + 'Sion.png', tags: ['Tank', 'Fighter'], info: { attack: 5, defense: 9, magic: 3, difficulty: 5 } },
    { id: '72', key: 'Skarner', name: 'Skarner', title: 'o Guardião de Cristal', image: this.baseImageUrl + 'Skarner.png', tags: ['Fighter', 'Tank'], info: { attack: 7, defense: 6, magic: 5, difficulty: 5 } },
    { id: '17', key: 'Teemo', name: 'Teemo', title: 'o Explorador Ágil', image: this.baseImageUrl + 'Teemo.png', tags: ['Marksman', 'Assassin'], info: { attack: 5, defense: 3, magic: 7, difficulty: 6 } },
    { id: '48', key: 'Trundle', name: 'Trundle', title: 'o Rei dos Trols', image: this.baseImageUrl + 'Trundle.png', tags: ['Fighter', 'Tank'], info: { attack: 7, defense: 6, magic: 2, difficulty: 5 } },
    { id: '23', key: 'Tryndamere', name: 'Tryndamere', title: 'o Rei Bárbaro', image: this.baseImageUrl + 'Tryndamere.png', tags: ['Fighter', 'Assassin'], info: { attack: 10, defense: 5, magic: 2, difficulty: 5 } },
    { id: '6', key: 'Urgot', name: 'Urgot', title: 'a Purga das Correntes', image: this.baseImageUrl + 'Urgot.png', tags: ['Fighter', 'Tank'], info: { attack: 8, defense: 5, magic: 3, difficulty: 8 } },
    { id: '110', key: 'Varus', name: 'Varus', title: 'a Flecha da Vingança', image: this.baseImageUrl + 'Varus.png', tags: ['Marksman', 'Mage'], info: { attack: 7, defense: 3, magic: 4, difficulty: 2 } },
    { id: '67', key: 'Vayne', name: 'Vayne', title: 'a Caçadora Noturna', image: this.baseImageUrl + 'Vayne.png', tags: ['Marksman', 'Assassin'], info: { attack: 10, defense: 1, magic: 1, difficulty: 8 } },
    { id: '8', key: 'Vladimir', name: 'Vladimir', title: 'o Ceifador Carmesim', image: this.baseImageUrl + 'Vladimir.png', tags: ['Mage'], info: { attack: 2, defense: 6, magic: 8, difficulty: 7 } },
    { id: '106', key: 'Volibear', name: 'Volibear', title: 'o Deus Implacável', image: this.baseImageUrl + 'Volibear.png', tags: ['Fighter', 'Tank'], info: { attack: 7, defense: 7, magic: 4, difficulty: 3 } },
    { id: '19', key: 'Warwick', name: 'Warwick', title: 'a Ira Desenfreada de Zaun', image: this.baseImageUrl + 'Warwick.png', tags: ['Fighter', 'Tank'], info: { attack: 9, defense: 5, magic: 2, difficulty: 3 } },
    { id: '157', key: 'Yasuo', name: 'Yasuo', title: 'o Imperdoável', image: this.baseImageUrl + 'Yasuo.png', tags: ['Fighter', 'Assassin'], info: { attack: 8, defense: 4, magic: 4, difficulty: 10 } },
    { id: '83', key: 'Yorick', name: 'Yorick', title: 'o Pastor de Almas', image: this.baseImageUrl + 'Yorick.png', tags: ['Fighter', 'Tank'], info: { attack: 6, defense: 6, magic: 3, difficulty: 6 } },
    { id: '154', key: 'Zac', name: 'Zac', title: 'a Arma Secreta', image: this.baseImageUrl + 'Zac.png', tags: ['Tank', 'Fighter'], info: { attack: 3, defense: 8, magic: 7, difficulty: 8 } },

    // Junglers
    { id: '121', key: 'Khazix', name: 'Kha\'Zix', title: 'o Ceifador do Vazio', image: this.baseImageUrl + 'Khazix.png', tags: ['Assassin'], info: { attack: 9, defense: 4, magic: 3, difficulty: 6 } },
    { id: '64', key: 'LeeSin', name: 'Lee Sin', title: 'o Monge Cego', image: this.baseImageUrl + 'LeeSin.png', tags: ['Fighter', 'Assassin'], info: { attack: 8, defense: 5, magic: 3, difficulty: 6 } },
    { id: '5', key: 'XinZhao', name: 'Xin Zhao', title: 'o Senescal de Demacia', image: this.baseImageUrl + 'XinZhao.png', tags: ['Fighter', 'Assassin'], info: { attack: 8, defense: 6, magic: 3, difficulty: 2 } },
    { id: '35', key: 'Shaco', name: 'Shaco', title: 'o Bufão Demoníaco', image: this.baseImageUrl + 'Shaco.png', tags: ['Assassin'], info: { attack: 8, defense: 4, magic: 6, difficulty: 9 } },
    { id: '11', key: 'MasterYi', name: 'Master Yi', title: 'o Espadachim Wuju', image: this.baseImageUrl + 'MasterYi.png', tags: ['Assassin', 'Fighter'], info: { attack: 10, defense: 4, magic: 2, difficulty: 4 } },
    { id: '107', key: 'Rengar', name: 'Rengar', title: 'o Caçador Orgulhoso', image: this.baseImageUrl + 'Rengar.png', tags: ['Assassin', 'Fighter'], info: { attack: 7, defense: 4, magic: 2, difficulty: 8 } },
    { id: '77', key: 'Udyr', name: 'Udyr', title: 'o Animal Espiritual', image: this.baseImageUrl + 'Udyr.png', tags: ['Fighter', 'Tank'], info: { attack: 8, defense: 7, magic: 4, difficulty: 7 } },
    { id: '60', key: 'Elise', name: 'Elise', title: 'a Rainha das Aranhas', image: this.baseImageUrl + 'Elise.png', tags: ['Mage', 'Fighter'], info: { attack: 6, defense: 5, magic: 7, difficulty: 9 } },
    { id: '79', key: 'Gragas', name: 'Gragas', title: 'o Gordo Rabugento', image: this.baseImageUrl + 'Gragas.png', tags: ['Fighter', 'Mage'], info: { attack: 4, defense: 7, magic: 6, difficulty: 5 } },
    { id: '104', key: 'Graves', name: 'Graves', title: 'o Fora da Lei', image: this.baseImageUrl + 'Graves.png', tags: ['Marksman'], info: { attack: 8, defense: 5, magic: 3, difficulty: 3 } },
    { id: '120', key: 'Hecarim', name: 'Hecarim', title: 'a Sombra da Guerra', image: this.baseImageUrl + 'Hecarim.png', tags: ['Fighter', 'Tank'], info: { attack: 8, defense: 6, magic: 4, difficulty: 6 } },
    { id: '59', key: 'JarvanIV', name: 'Jarvan IV', title: 'o Exemplo de Demacia', image: this.baseImageUrl + 'JarvanIV.png', tags: ['Tank', 'Fighter'], info: { attack: 6, defense: 8, magic: 3, difficulty: 5 } },
    { id: '126', key: 'Jayce', name: 'Jayce', title: 'o Defensor do Amanhã', image: this.baseImageUrl + 'Jayce.png', tags: ['Fighter', 'Marksman'], info: { attack: 8, defense: 4, magic: 3, difficulty: 7 } },
    { id: '203', key: 'Kindred', name: 'Kindred', title: 'os Caçadores Eternos', image: this.baseImageUrl + 'Kindred.png', tags: ['Marksman'], info: { attack: 8, defense: 2, magic: 2, difficulty: 4 } },

    // ADCs/Marksmen
    { id: '22', key: 'Ashe', name: 'Ashe', title: 'a Arqueira de Gelo', image: this.baseImageUrl + 'Ashe.png', tags: ['Marksman', 'Support'], info: { attack: 7, defense: 3, magic: 2, difficulty: 4 } },
    { id: '51', key: 'Caitlyn', name: 'Caitlyn', title: 'a Xerife de Piltover', image: this.baseImageUrl + 'Caitlyn.png', tags: ['Marksman'], info: { attack: 8, defense: 2, magic: 2, difficulty: 6 } },
    { id: '119', key: 'Draven', name: 'Draven', title: 'o Carrasco de Noxus', image: this.baseImageUrl + 'Draven.png', tags: ['Marksman'], info: { attack: 9, defense: 3, magic: 1, difficulty: 8 } },
    { id: '81', key: 'Ezreal', name: 'Ezreal', title: 'o Explorador Pródigo', image: this.baseImageUrl + 'Ezreal.png', tags: ['Marksman', 'Mage'], info: { attack: 7, defense: 2, magic: 6, difficulty: 7 } },
    { id: '222', key: 'Jinx', name: 'Jinx', title: 'a Gatilho Desenfreado', image: this.baseImageUrl + 'Jinx.png', tags: ['Marksman'], info: { attack: 9, defense: 2, magic: 4, difficulty: 6 } },
    { id: '96', key: 'KogMaw', name: 'Kog\'Maw', title: 'a Boca do Abismo', image: this.baseImageUrl + 'KogMaw.png', tags: ['Marksman', 'Mage'], info: { attack: 8, defense: 2, magic: 5, difficulty: 6 } },
    { id: '236', key: 'Lucian', name: 'Lucian', title: 'o Purificador', image: this.baseImageUrl + 'Lucian.png', tags: ['Marksman'], info: { attack: 8, defense: 5, magic: 3, difficulty: 6 } },
    { id: '21', key: 'MissFortune', name: 'Miss Fortune', title: 'a Caçadora de Recompensas', image: this.baseImageUrl + 'MissFortune.png', tags: ['Marksman'], info: { attack: 8, defense: 2, magic: 5, difficulty: 1 } },
    { id: '15', key: 'Sivir', name: 'Sivir', title: 'a Mestra da Guerra', image: this.baseImageUrl + 'Sivir.png', tags: ['Marksman'], info: { attack: 9, defense: 3, magic: 1, difficulty: 4 } },
    { id: '18', key: 'Tristana', name: 'Tristana', title: 'a Yordle Artilheira', image: this.baseImageUrl + 'Tristana.png', tags: ['Marksman', 'Assassin'], info: { attack: 9, defense: 3, magic: 5, difficulty: 4 } },
    { id: '29', key: 'Twitch', name: 'Twitch', title: 'a Praga dos Ratos', image: this.baseImageUrl + 'Twitch.png', tags: ['Marksman', 'Assassin'], info: { attack: 9, defense: 2, magic: 3, difficulty: 6 } },

    // Supports
    { id: '53', key: 'Blitzcrank', name: 'Blitzcrank', title: 'o Golem a Vapor', image: this.baseImageUrl + 'Blitzcrank.png', tags: ['Tank', 'Fighter'], info: { attack: 4, defense: 8, magic: 5, difficulty: 4 } },
    { id: '201', key: 'Braum', name: 'Braum', title: 'o Coração de Freljord', image: this.baseImageUrl + 'Braum.png', tags: ['Support', 'Tank'], info: { attack: 3, defense: 9, magic: 4, difficulty: 3 } },
    { id: '40', key: 'Janna', name: 'Janna', title: 'a Fúria da Tempestade', image: this.baseImageUrl + 'Janna.png', tags: ['Support', 'Mage'], info: { attack: 3, defense: 5, magic: 7, difficulty: 7 } },
    { id: '37', key: 'Sona', name: 'Sona', title: 'a Virtuose das Cordas', image: this.baseImageUrl + 'Sona.png', tags: ['Support', 'Mage'], info: { attack: 5, defense: 2, magic: 8, difficulty: 4 } },
    { id: '16', key: 'Soraka', name: 'Soraka', title: 'a Filha das Estrelas', image: this.baseImageUrl + 'Soraka.png', tags: ['Support', 'Mage'], info: { attack: 2, defense: 5, magic: 7, difficulty: 3 } },
    { id: '223', key: 'TahmKench', name: 'Tahm Kench', title: 'o Rei do Rio', image: this.baseImageUrl + 'TahmKench.png', tags: ['Support', 'Tank'], info: { attack: 3, defense: 9, magic: 6, difficulty: 5 } },
    { id: '412', key: 'Thresh', name: 'Thresh', title: 'o Guardião das Correntes', image: this.baseImageUrl + 'Thresh.png', tags: ['Support', 'Fighter'], info: { attack: 5, defense: 6, magic: 6, difficulty: 7 } },
    { id: '143', key: 'Zyra', name: 'Zyra', title: 'a Ascensão dos Espinhos', image: this.baseImageUrl + 'Zyra.png', tags: ['Mage', 'Support'], info: { attack: 4, defense: 3, magic: 8, difficulty: 7 } },
    { id: '267', key: 'Nami', name: 'Nami', title: 'a Conjuradora das Marés', image: this.baseImageUrl + 'Nami.png', tags: ['Support', 'Mage'], info: { attack: 4, defense: 3, magic: 6, difficulty: 5 } },
    { id: '43', key: 'Karma', name: 'Karma', title: 'a Iluminada', image: this.baseImageUrl + 'Karma.png', tags: ['Mage', 'Support'], info: { attack: 1, defense: 7, magic: 8, difficulty: 5 } },
    { id: '61', key: 'Orianna', name: 'Orianna', title: 'a Senhora Mecânica', image: this.baseImageUrl + 'Orianna.png', tags: ['Mage', 'Support'], info: { attack: 4, defense: 3, magic: 9, difficulty: 7 } },
    { id: '26', key: 'Zilean', name: 'Zilean', title: 'o Cronomanante', image: this.baseImageUrl + 'Zilean.png', tags: ['Support', 'Mage'], info: { attack: 2, defense: 5, magic: 8, difficulty: 6 } },

    // Campeões adicionais para completar a lista
    { id: '31', key: 'Chogath', name: 'Cho\'Gath', title: 'o Terror do Vazio', image: this.baseImageUrl + 'Chogath.png', tags: ['Tank', 'Mage'], info: { attack: 3, defense: 7, magic: 7, difficulty: 5 } },
    { id: '38', key: 'Kassadin', name: 'Kassadin', title: 'o Andarilho do Vazio', image: this.baseImageUrl + 'Kassadin.png', tags: ['Assassin', 'Mage'], info: { attack: 3, defense: 5, magic: 8, difficulty: 8 } },
    { id: '10', key: 'Kayle', name: 'Kayle', title: 'a Justa', image: this.baseImageUrl + 'Kayle.png', tags: ['Fighter', 'Support'], info: { attack: 6, defense: 6, magic: 7, difficulty: 7 } },
    { id: '85', key: 'Kennen', name: 'Kennen', title: 'o Coração da Tempestade', image: this.baseImageUrl + 'Kennen.png', tags: ['Mage', 'Marksman'], info: { attack: 6, defense: 4, magic: 7, difficulty: 4 } },
    { id: '12', key: 'Alistar', name: 'Alistar', title: 'o Minotauro', image: this.baseImageUrl + 'Alistar.png', tags: ['Tank', 'Support'], info: { attack: 6, defense: 9, magic: 5, difficulty: 7 } },
    { id: '32', key: 'Amumu', name: 'Amumu', title: 'a Múmia Melancólica', image: this.baseImageUrl + 'Amumu.png', tags: ['Tank', 'Mage'], info: { attack: 2, defense: 6, magic: 8, difficulty: 3 } },
    { id: '36', key: 'DrMundo', name: 'Dr. Mundo', title: 'o Louco de Zaun', image: this.baseImageUrl + 'DrMundo.png', tags: ['Fighter', 'Tank'], info: { attack: 5, defense: 7, magic: 6, difficulty: 5 } },
    { id: '56', key: 'Nocturne', name: 'Nocturne', title: 'o Eterno Pesadelo', image: this.baseImageUrl + 'Nocturne.png', tags: ['Assassin', 'Fighter'], info: { attack: 9, defense: 5, magic: 2, difficulty: 4 } },
    { id: '20', key: 'Nunu', name: 'Nunu e Willump', title: 'o Garoto e seu Yeti', image: this.baseImageUrl + 'Nunu.png', tags: ['Tank', 'Fighter'], info: { attack: 4, defense: 6, magic: 7, difficulty: 4 } },
    { id: '74', key: 'Heimerdinger', name: 'Heimerdinger', title: 'o Inventor Estimado', image: this.baseImageUrl + 'Heimerdinger.png', tags: ['Mage', 'Support'], info: { attack: 2, defense: 6, magic: 8, difficulty: 8 } },
    { id: '30', key: 'Karthus', name: 'Karthus', title: 'o Ceifador', image: this.baseImageUrl + 'Karthus.png', tags: ['Mage'], info: { attack: 2, defense: 2, magic: 10, difficulty: 7 } },
    { id: '113', key: 'Sejuani', name: 'Sejuani', title: 'a Fúria do Norte', image: this.baseImageUrl + 'Sejuani.png', tags: ['Tank', 'Fighter'], info: { attack: 5, defense: 7, magic: 6, difficulty: 4 } },
    { id: '27', key: 'Singed', name: 'Singed', title: 'o Químico Louco', image: this.baseImageUrl + 'Singed.png', tags: ['Tank', 'Fighter'], info: { attack: 4, defense: 8, magic: 7, difficulty: 5 } },
    { id: '50', key: 'Swain', name: 'Swain', title: 'o Grão-General de Noxus', image: this.baseImageUrl + 'Swain.png', tags: ['Mage', 'Fighter'], info: { attack: 2, defense: 6, magic: 9, difficulty: 8 } },
    { id: '516', key: 'Ornn', name: 'Ornn', title: 'o Fogo sob a Montanha', image: this.baseImageUrl + 'Ornn.png', tags: ['Tank', 'Fighter'], info: { attack: 5, defense: 9, magic: 3, difficulty: 5 } },
    { id: '76', key: 'Nidalee', name: 'Nidalee', title: 'a Caçadora Bestial', image: this.baseImageUrl + 'Nidalee.png', tags: ['Assassin', 'Mage'], info: { attack: 5, defense: 4, magic: 7, difficulty: 8 } },
    { id: '80', key: 'Pantheon', name: 'Pantheon', title: 'a Lança Indestrutível', image: this.baseImageUrl + 'Pantheon.png', tags: ['Fighter', 'Assassin'], info: { attack: 9, defense: 4, magic: 3, difficulty: 4 } },
    { id: '78', key: 'Poppy', name: 'Poppy', title: 'a Guardiã do Martelo', image: this.baseImageUrl + 'Poppy.png', tags: ['Tank', 'Fighter'], info: { attack: 6, defense: 8, magic: 2, difficulty: 6 } },
    { id: '33', key: 'Rammus', name: 'Rammus', title: 'o Tatu Blindado', image: this.baseImageUrl + 'Rammus.png', tags: ['Tank', 'Fighter'], info: { attack: 4, defense: 10, magic: 5, difficulty: 5 } },
    { id: '58', key: 'Renekton', name: 'Renekton', title: 'o Carniceiro das Areias', image: this.baseImageUrl + 'Renekton.png', tags: ['Fighter', 'Tank'], info: { attack: 8, defense: 5, magic: 2, difficulty: 3 } },
    { id: '92', key: 'Riven', name: 'Riven', title: 'a Exilada', image: this.baseImageUrl + 'Riven.png', tags: ['Fighter', 'Assassin'], info: { attack: 8, defense: 5, magic: 1, difficulty: 8 } },
    { id: '111', key: 'Nautilus', name: 'Nautilus', title: 'o Titã das Profundezas', image: this.baseImageUrl + 'Nautilus.png', tags: ['Tank', 'Support'], info: { attack: 4, defense: 6, magic: 6, difficulty: 6 } },
    { id: '75', key: 'Nasus', name: 'Nasus', title: 'o Curador das Areias', image: this.baseImageUrl + 'Nasus.png', tags: ['Fighter', 'Tank'], info: { attack: 7, defense: 5, magic: 6, difficulty: 6 } },
    { id: '28', key: 'Evelynn', name: 'Evelynn', title: 'a Viúva Sombria', image: this.baseImageUrl + 'Evelynn.png', tags: ['Assassin', 'Mage'], info: { attack: 4, defense: 2, magic: 7, difficulty: 10 } },    { id: '9', key: 'Fiddlesticks', name: 'Fiddlesticks', title: 'o Ceifador Ancestral', image: this.baseImageUrl + 'Fiddlesticks.png', tags: ['Mage', 'Support'], info: { attack: 2, defense: 3, magic: 9, difficulty: 9 } },
    { id: '41', key: 'Gangplank', name: 'Gangplank', title: 'o Flagelo dos Mares', image: this.baseImageUrl + 'Gangplank.png', tags: ['Fighter'], info: { attack: 7, defense: 4, magic: 4, difficulty: 9 } },
    { id: '150', key: 'Gnar', name: 'Gnar', title: 'o Elo Perdido', image: this.baseImageUrl + 'Gnar.png', tags: ['Fighter', 'Tank'], info: { attack: 6, defense: 5, magic: 5, difficulty: 8 } },
    { id: '3', key: 'Galio', name: 'Galio', title: 'o Colosso', image: this.baseImageUrl + 'Galio.png', tags: ['Tank', 'Mage'], info: { attack: 1, defense: 10, magic: 6, difficulty: 5 } }
  ];

  private roleMapping = {
    top: ['Fighter', 'Tank'],
    jungle: ['Assassin', 'Fighter', 'Tank'],
    mid: ['Mage', 'Assassin'],
    adc: ['Marksman'],
    support: ['Support', 'Tank', 'Mage']  };

  /**
   * MAPEAMENTO CENTRALIZADO DE CAMPEÕES
   *
   * Este é o único local onde o mapeamento de championId para nome deve ser definido.
   *
   * IMPORTANTE: Para adicionar novos campeões ou alterar nomes existentes,
   * edite APENAS este mapa. Todos os componentes (dashboard, match-history, etc.)
   * usam o método estático getChampionNameById() que consulta este mapa.
   *
   * NÃO crie mapeamentos duplicados em outros arquivos!
   */
  private static readonly CHAMPION_ID_TO_NAME_MAP: { [key: number]: string } = {
    1: 'Annie', 2: 'Olaf', 3: 'Galio', 4: 'TwistedFate', 5: 'XinZhao',
    6: 'Urgot', 7: 'LeBlanc', 8: 'Vladimir', 9: 'Fiddlesticks', 10: 'Kayle',
    11: 'MasterYi', 12: 'Alistar', 13: 'Ryze', 14: 'Sion', 15: 'Sivir',
    16: 'Soraka', 17: 'Teemo', 18: 'Tristana', 19: 'Warwick', 20: 'Nunu',
    21: 'MissFortune', 22: 'Ashe', 23: 'Tryndamere', 24: 'Jax', 25: 'Morgana',
    26: 'Zilean', 27: 'Singed', 28: 'Evelynn', 29: 'Twitch', 30: 'Karthus',
    31: 'Chogath', 32: 'Amumu', 33: 'Rammus', 34: 'Anivia', 35: 'Shaco',
    36: 'DrMundo', 37: 'Sona', 38: 'Kassadin', 39: 'Irelia', 40: 'Janna',
    41: 'Gangplank', 42: 'Corki', 43: 'Karma', 44: 'Taric', 45: 'Veigar',
    48: 'Trundle', 50: 'Swain', 51: 'Caitlyn', 53: 'Blitzcrank', 54: 'Malphite',
    55: 'Katarina', 56: 'Nocturne', 57: 'Maokai', 58: 'Renekton', 59: 'JarvanIV',
    60: 'Elise', 61: 'Orianna', 62: 'MonkeyKing', 63: 'Brand', 64: 'LeeSin',
    67: 'Vayne', 68: 'Rumble', 69: 'Cassiopeia', 72: 'Skarner', 74: 'Heimerdinger',
    75: 'Nasus', 76: 'Nidalee', 77: 'Udyr', 78: 'Poppy', 79: 'Gragas',
    80: 'Pantheon', 81: 'Ezreal', 82: 'Mordekaiser', 83: 'Yorick', 84: 'Akali',
    85: 'Kennen', 86: 'Garen', 89: 'Leona', 90: 'Malzahar', 91: 'Talon',
    92: 'Riven', 96: 'KogMaw', 98: 'Shen', 99: 'Lux', 101: 'Xerath',
    102: 'Shyvana', 103: 'Ahri', 104: 'Graves', 105: 'Fizz', 106: 'Volibear',
    107: 'Rengar', 110: 'Varus', 111: 'Nautilus', 112: 'Viktor', 113: 'Sejuani',
    114: 'Fiora', 115: 'Ziggs', 117: 'Lulu', 119: 'Draven', 120: 'Hecarim',
    121: 'Khazix', 122: 'Darius', 126: 'Jayce', 127: 'Lissandra', 131: 'Diana',
    133: 'Quinn', 134: 'Syndra', 136: 'AurelionSol', 141: 'Kayn', 142: 'Zoe',
    143: 'Zyra', 145: 'Kaisa', 147: 'Seraphine', 150: 'Gnar', 154: 'Zac',
    157: 'Yasuo', 161: 'Velkoz', 163: 'Taliyah', 164: 'Camille', 166: 'Akshan',
    200: 'Belveth', 201: 'Braum', 202: 'Jhin', 203: 'Kindred', 221: 'Zeri',
    222: 'Jinx', 223: 'TahmKench', 234: 'Viego', 235: 'Senna', 236: 'Lucian',
    238: 'Zed', 245: 'Ekko', 246: 'Qiyana', 254: 'Vi', 266: 'Aatrox',
    267: 'Nami', 268: 'Azir', 350: 'Yuumi', 360: 'Samira', 412: 'Thresh',
    420: 'Illaoi', 421: 'RekSai', 427: 'Ivern', 429: 'Kalista', 432: 'Bard',
    497: 'Rakan', 498: 'Xayah', 516: 'Ornn', 517: 'Sylas', 518: 'Neeko',
    523: 'Aphelios', 526: 'Rell', 555: 'Pyke', 650: 'Briar', 711: 'Vex',
    777: 'Yone', 875: 'Sett', 876: 'Lillia', 887: 'Gwen', 888: 'Renata',
    893: 'Aurora', 895: 'Nilah', 897: 'KSante', 901: 'Smolder', 910: 'Hwei',
    950: 'Naafiri', 960: 'Ambessa'  };

  /**
   * Obtém o nome do campeão pelo seu ID
   *
   * Este método usa o mapeamento centralizado acima e deve ser usado por todos os componentes.
   *
   * @param championId - ID numérico do campeão
   * @returns Nome do campeão ou 'Aatrox' como fallback
   */
  static getChampionNameById(championId: number | undefined): string {
    if (!championId) return 'Aatrox'; // Fallback válido
    return ChampionService.CHAMPION_ID_TO_NAME_MAP[championId] || 'Aatrox';
  }

  getAllChampions(): Champion[] {
    return this.allChampions;
  }
  getChampionsByRole(): ChampionsByRole {
    const result: ChampionsByRole = {
      top: [],
      jungle: [],
      mid: [],
      adc: [],
      support: [],
      all: this.allChampions
    };

    console.log(`🏷️ ChampionService: Total de campeões na base: ${this.allChampions.length}`);

    this.allChampions.forEach(champion => {
      // Top lane
      if (champion.tags.some(tag => this.roleMapping.top.includes(tag))) {
        result.top.push(champion);
      }

      // Jungle
      if (champion.tags.some(tag => this.roleMapping.jungle.includes(tag))) {
        result.jungle.push(champion);
      }

      // Mid lane
      if (champion.tags.some(tag => this.roleMapping.mid.includes(tag))) {
        result.mid.push(champion);
      }

      // ADC
      if (champion.tags.some(tag => this.roleMapping.adc.includes(tag))) {
        result.adc.push(champion);
      }

      // Support
      if (champion.tags.some(tag => this.roleMapping.support.includes(tag))) {
        result.support.push(champion);
      }
    });

    console.log(`🏷️ ChampionService: Campeões por role:`, {
      all: result.all.length,
      top: result.top.length,
      jungle: result.jungle.length,
      mid: result.mid.length,
      adc: result.adc.length,
      support: result.support.length
    });

    return result;
  }

  searchChampions(query: string, role?: string): Champion[] {
    let champions = role && role !== 'all' ? this.getChampionsByRole()[role as keyof ChampionsByRole] : this.allChampions;

    if (!query.trim()) {
      return champions;
    }

    return champions.filter(champion =>
      champion.name.toLowerCase().includes(query.toLowerCase()) ||
      champion.title.toLowerCase().includes(query.toLowerCase()) ||
      champion.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
    );
  }

  getRandomChampion(excludeIds: string[] = []): Champion {
    const availableChampions = this.allChampions.filter(c => !excludeIds.includes(c.id));
    const randomIndex = Math.floor(Math.random() * availableChampions.length);
    return availableChampions[randomIndex];
  }

  isChampionBanned(championId: string, bannedChampions: Champion[]): boolean {
    return bannedChampions.some(banned => banned.id === championId);
  }

  isChampionPicked(championId: string, pickedChampions: Champion[]): boolean {
    return pickedChampions.some(picked => picked.id === championId);
  }
}
