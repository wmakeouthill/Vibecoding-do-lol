import json
import sys

# Dados da API (truncados para demonstração)
raw_data = """{"success":true,"match":{"metadata":{"dataVersion":"2","matchId":"BR1_3108824461","participants":["u5NX_aVe9Uf4HTrlzSIu-8xfHit85d8UU-Mc1cQAml7GsWdH5WmLUXa_tvOzTzFRGRqonK7AhLMMIA","8ZL5r-uTRB8PCfnZMT_Nsmg1bT9IZQwoOVTJHvxkUJcezstBh6s2z0THBuQsD-VfoluydNiKXh10ew","urB_l73xkJ_RipsLKwgWw-WSs8eUUROHkHJ9QcoDLuChHtEGcGlNPj9LRrZRhQfgHKGzOyUy36GbTw","7KzM07R8iMTdrcDRoF-D5O7IOl_E2AKHRUU5GflDtw2q3fAc4g6PTIQL9pXgg9afNxw-xhEBO_0GoQ"]}}}"""

# Dados simulados baseados na resposta real
match_data = {
    "matchId": "BR1_3108824461",
    "gameMode": "ARAM",
    "gameDuration": 1215,  # em segundos (20 minutos 15 segundos)
    "gameCreation": 1749883770849,
    "playerData": {
        "championName": "Naafiri",
        "championId": 950,
        "kills": 15,
        "deaths": 14,
        "assists": 14,
        "win": True,
        "items": [126697, 6692, 6676, 6694, 2021, 3020],
        "summoner1Id": 4,  # Flash
        "summoner2Id": 32,  # Mark/Dash
        "riotIdGameName": "popcorn seller",
        "riotIdTagline": "coup",
        "goldEarned": 14827,
        "totalDamageDealtToChampions": 27929,
        "totalMinionsKilled": 22
    },
    "allParticipants": [
        {"championName": "Darius", "kills": 10, "deaths": 12, "assists": 16, "win": True, "teamId": 100},
        {"championName": "Gangplank", "kills": 6, "deaths": 11, "assists": 26, "win": True, "teamId": 100},
        {"championName": "Varus", "kills": 10, "deaths": 8, "assists": 24, "win": True, "teamId": 100},
        {"championName": "Naafiri", "kills": 15, "deaths": 14, "assists": 14, "win": True, "teamId": 100},
        {"championName": "Nidalee", "kills": 7, "deaths": 9, "assists": 29, "win": True, "teamId": 100},
        {"championName": "Illaoi", "kills": 7, "deaths": 13, "assists": 23, "win": False, "teamId": 200},
        {"championName": "Nami", "kills": 1, "deaths": 9, "assists": 43, "win": False, "teamId": 200},
        {"championName": "Zoe", "kills": 21, "deaths": 8, "assists": 14, "win": False, "teamId": 200},
        {"championName": "Vayne", "kills": 8, "deaths": 11, "assists": 19, "win": False, "teamId": 200},
        {"championName": "Riven", "kills": 17, "deaths": 8, "assists": 21, "win": False, "teamId": 200}
    ]
}

print("=== ESTRUTURA DOS DADOS DA PARTIDA ===")
print(f"ID da Partida: {match_data['matchId']}")
print(f"Modo de Jogo: {match_data['gameMode']}")
print(f"Duração: {match_data['gameDuration'] // 60}m {match_data['gameDuration'] % 60}s")
print()

print("=== DADOS DO JOGADOR PRINCIPAL ===")
player = match_data['playerData']
print(f"Campeão: {player['championName']} (ID: {player['championId']})")
print(f"KDA: {player['kills']}/{player['deaths']}/{player['assists']}")
print(f"Resultado: {'Vitória' if player['win'] else 'Derrota'}")
print(f"Itens: {player['items']}")
print(f"Gold Ganho: {player['goldEarned']}")
print(f"Dano aos Campeões: {player['totalDamageDealtToChampions']}")
print()

print("=== COMO DEVERIA APARECER NO FRONTEND ===")
print("1. CARD DA PARTIDA:")
print(f"   - Modo: {match_data['gameMode']}")
print(f"   - Duração: {match_data['gameDuration'] // 60}m {match_data['gameDuration'] % 60}s")
print(f"   - Resultado: {'VITÓRIA' if player['win'] else 'DERROTA'}")
print()

print("2. INFORMAÇÕES DO JOGADOR:")
print(f"   - Imagem do Campeão: https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/{player['championName']}.png")
print(f"   - Nome: {player['championName']}")
print(f"   - KDA: {player['kills']}/{player['deaths']}/{player['assists']}")
print(f"   - CS: {player['totalMinionsKilled']}")
print()

print("3. ITENS:")
for i, item_id in enumerate(player['items']):
    if item_id and item_id != 0:
        print(f"   - Item {i+1}: https://ddragon.leagueoflegends.com/cdn/15.12.1/img/item/{item_id}.png")
print()

print("4. TIMES:")
print("   Time Azul (100):")
for p in match_data['allParticipants'][:5]:
    print(f"   - {p['championName']}: {p['kills']}/{p['deaths']}/{p['assists']}")
print("   Time Vermelho (200):")
for p in match_data['allParticipants'][5:]:
    print(f"   - {p['championName']}: {p['kills']}/{p['deaths']}/{p['assists']}")
print()

print("=== MAPEAMENTO PARA O FRONTEND ===")
print("O frontend deve processar os dados assim:")
print("1. Buscar o participante com o PUUID do jogador atual")
print("2. Extrair dados do jogador: championName, kills, deaths, assists, win, items")
print("3. Extrair dados da partida: gameMode, gameDuration, gameCreation")
print("4. Normalizar imagens dos campeões (KaiSa -> Kaisa, etc.)")
print("5. Exibir resultado com cores (verde para vitória, vermelho para derrota)")
