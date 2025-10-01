import mysql from 'mysql2/promise'

let pool: mysql.Pool | null = null

export function hasMySql(){
  return !!(process.env.MYSQL_HOST && process.env.MYSQL_DATABASE && process.env.MYSQL_USER)
}

export function getPool(){
  if(!hasMySql()) return null
  if(!pool){
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT||3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD||undefined,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONN_LIMIT||5),
    })
  }
  return pool
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]>{
  const p = getPool(); if(!p) throw new Error('MySQL not configured')
  const [rows] = await p.execute(sql, params)
  return rows as T[]
}

