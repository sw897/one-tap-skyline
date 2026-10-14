import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import type {D1Database} from '@cloudflare/workers-types';

type Value=string|number|null;
export class NodeDatabase {
  readonly connection:DatabaseSync;
  private depth=0;
  private queue:Promise<unknown>=Promise.resolve();
  constructor(file:string,migrations:string) {
    this.connection=new DatabaseSync(file);
    this.connection.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.connection.exec('CREATE TABLE IF NOT EXISTS skyline_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL)');
    const journal=JSON.parse(readFileSync(path.join(migrations,'meta/_journal.json'),'utf8')) as {entries:{tag:string}[]};
    for(const {tag} of journal.entries) {
      const sql=readFileSync(path.join(migrations,tag+'.sql'),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
      const applied=this.connection.prepare('SELECT sha256 FROM skyline_migrations WHERE name=?').get(tag);
      if(applied){if(applied.sha256!==hash){this.connection.close();throw Error('applied_migration_changed');}continue;}
      this.connection.exec('BEGIN IMMEDIATE');
      try{this.connection.exec(sql);this.connection.prepare('INSERT INTO skyline_migrations VALUES(?,?)').run(tag,hash);this.connection.exec('COMMIT');}
      catch(error){this.connection.exec('ROLLBACK');this.connection.close();throw error;}
    }
  }
  asD1(){return this as unknown as D1Database;}
  prepare(sql:string){return new NodeStatement(this,sql);}
  async batch(statements:NodeStatement[]){
    const nested=this.depth>0;
    this.connection.exec(nested?'SAVEPOINT skyline_batch':'BEGIN IMMEDIATE');
    try{const rows=statements.map(s=>s.execute());this.connection.exec(nested?'RELEASE skyline_batch':'COMMIT');return rows;}
    catch(error){this.connection.exec(nested?'ROLLBACK TO skyline_batch':'ROLLBACK');if(nested)this.connection.exec('RELEASE skyline_batch');throw error;}
  }
  /** The single instance serializes logical DB work, never request bodies or file IO. */
  atomic<T>(job:()=>Promise<T>,validate?:()=>void):Promise<T>{
    const next=this.queue.then(async()=>{
      this.connection.exec('BEGIN IMMEDIATE');this.depth=1;
      try{const result=await job();validate?.();this.connection.exec('COMMIT');return result;}
      catch(error){this.connection.exec('ROLLBACK');throw error;}
      finally{this.depth=0;}
    });
    this.queue=next.catch(()=>{});
    return next;
  }
  close(){this.connection.close();}
}
class NodeStatement {
  constructor(readonly db:NodeDatabase,readonly sql:string,readonly values:Value[]=[]){}
  bind(...values:Value[]){return new NodeStatement(this.db,this.sql,values);}
  execute(){
    const started=performance.now(),stmt=this.db.connection.prepare(this.sql),hasColumns=stmt.columns().length>0;
    const results=hasColumns?stmt.all(...this.values):[];
    const info=hasColumns?this.db.connection.prepare('SELECT changes() AS changes,last_insert_rowid() AS last_id').get():stmt.run(...this.values);
    const changes=/^\s*(SELECT|PRAGMA)/i.test(this.sql)?0:Number(info?.changes??0);
    const last=info&&'last_id'in info?info.last_id:info&&'lastInsertRowid'in info?info.lastInsertRowid:0;
    return {success:true,results,meta:{changes,last_row_id:Number(last),duration:performance.now()-started,rows_read:results.length,rows_written:changes,size_after:0,changed_db:changes>0}};
  }
  async first<T>(column?:string):Promise<T|null>{const row=this.execute().results[0];return (row?(column?row[column]:row):null) as T|null;}
  async all(){return this.execute();}
  async run(){return this.execute();}
}
