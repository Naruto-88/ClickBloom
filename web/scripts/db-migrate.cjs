#!/usr/bin/env node
const mysql = require('mysql2/promise')

async function main(){
  const required = ['MYSQL_HOST','MYSQL_DATABASE','MYSQL_USER']
  for(const k of required){ if(!process.env[k]){ console.error(`Missing ${k}`); process.exit(1) } }
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT||3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD||undefined,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true
  })
  const fs = require('fs'); const path = require('path')
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
  await conn.query(sql)
  await conn.end()
  console.log('Migration applied')
}

main().catch(e=>{ console.error(e); process.exit(1) })

