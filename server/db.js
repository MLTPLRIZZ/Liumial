import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath || './data/liumial.db';
    this.db = null;
  }

  initialize() {
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('Database connection error:', err);
        process.exit(1);
      }
      console.log('✓ Database connected');
    });

    this.db.serialize(() => {
      this.createTables();
    });
  }

  createTables() {
    this.db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, displayName TEXT, passwordHash TEXT, avatarColor TEXT DEFAULT '#6ee7b7', xp INTEGER DEFAULT 0, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS servers (id TEXT PRIMARY KEY, name TEXT NOT NULL, ownerId TEXT NOT NULL, members TEXT DEFAULT '[]', createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, serverId TEXT NOT NULL, name TEXT NOT NULL, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, serverId TEXT NOT NULL, channelId TEXT NOT NULL, authorId TEXT NOT NULL, content TEXT NOT NULL, ts DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS quests (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, type TEXT DEFAULT 'chat', reward INTEGER DEFAULT 10, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    this.db.run(`CREATE TABLE IF NOT EXISTS user_quest_progress (id TEXT PRIMARY KEY, userId TEXT NOT NULL, questId TEXT NOT NULL, completed BOOLEAN DEFAULT 0, completedAt DATETIME, UNIQUE(userId, questId))`);
    console.log('✓ Database tables initialized');
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export default Database;