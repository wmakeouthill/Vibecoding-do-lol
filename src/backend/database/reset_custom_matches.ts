// Script para resetar a tabela custom_matches do banco matchmaking.db
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import * as path from 'path';

async function resetCustomMatches() {
  // Caminho igual ao usado no DatabaseManager
  const userDataPath = process.env.NODE_ENV === 'development'
    ? path.join(process.cwd(), 'data')
    : path.join(process.env.APPDATA || process.env.HOME || '.', 'lol-matchmaking');
  const dbPath = path.join(userDataPath, 'matchmaking.db');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    await db.exec('DELETE FROM custom_matches;');
    await db.exec("DELETE FROM sqlite_sequence WHERE name='custom_matches';");
    console.log('✅ Tabela custom_matches resetada com sucesso!');
  } catch (error) {
    console.error('Erro ao resetar tabela custom_matches:', error);
  } finally {
    await db.close();
  }
}

resetCustomMatches();
