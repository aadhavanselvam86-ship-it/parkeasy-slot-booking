// MongoDB layer: chat logs + feedback. In-memory fallback when MONGODB_URI is not set.
let clientPromise = null;
const mem = { chat_logs: [], feedback: [] };

async function db() {
  if (!process.env.MONGODB_URI) return null;
  if (!clientPromise) {
    const { MongoClient } = require('mongodb');
    clientPromise = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).connect()
      .catch(e => { clientPromise = null; throw e; });
  }
  return (await clientPromise).db(process.env.MONGODB_DB || 'parkeasy');
}

exports.mode = () => (process.env.MONGODB_URI ? 'mongodb' : 'memory');
exports.ping = async () => { const d = await db(); if (d) await d.command({ ping: 1 }); return true; };

async function insert(col, doc) {
  doc.createdAt = new Date();
  const d = await db();
  if (d) { const r = await d.collection(col).insertOne(doc); return String(r.insertedId); }
  mem[col].push(doc); return String(mem[col].length);
}
exports.logChat = doc => insert('chat_logs', doc);
exports.saveFeedback = doc => insert('feedback', doc);
