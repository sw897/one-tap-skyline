import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import type { D1Database } from '@cloudflare/workers-types';

/** SQLite-backed D1 contract adapter for transaction fault tests; not hosted D1. */
export class SqliteD1 {
  readonly connection:DatabaseSync;
  failAt:number|undefined;
  failOnBatch:number|undefined;
  batchCalls=0;
  constructor(file=':memory:') {
    this.connection=new DatabaseSync(file);this.connection.exec('PRAGMA foreign_keys=ON');
    const directory=new URL('../drizzle/',import.meta.url);
    for(const name of readdirSync(directory).filter(x=>x.endsWith('.sql')).sort())this.connection.exec(readFileSync(new URL(name,directory),'utf8'));
  }
  asD1(){return this as unknown as D1Database;}
  prepare(query:string){return new Statement(this,query);}
  async batch(statements:Statement[]) {
    this.batchCalls++;
    this.connection.exec('BEGIN');
    try {
      const results=statements.map((s,i)=>{if(this.failAt===i&&(this.failOnBatch===undefined||this.batchCalls===this.failOnBatch))throw new Error('Injected transaction failure');return s.execute();});
      this.connection.exec('COMMIT');return results;
    }catch(error){this.connection.exec('ROLLBACK');throw error;}
  }
  close(){this.connection.close();}
}
class Statement {
  readonly db:SqliteD1;readonly query:string;values:(string|number|null)[]=[];
  constructor(db:SqliteD1,query:string){this.db=db;this.query=query;}
  bind(...values:(string|number|null)[]){const s=new Statement(this.db,this.query);s.values=values;return s;}
  execute(){
    const prepared=this.db.connection.prepare(this.query),rows=prepared.columns().length?prepared.all(...this.values):[];
    const info=rows.length||prepared.columns().length?this.db.connection.prepare('SELECT changes() AS changes,last_insert_rowid() AS last_row_id').get():prepared.run(...this.values);
    const changes=/^\s*(SELECT|PRAGMA)/i.test(this.query)?0:Number(info?.changes??0);
    const lastId=info&&'last_row_id' in info?info.last_row_id:info&&'lastInsertRowid' in info?info.lastInsertRowid:0;
    return {success:true,results:rows,meta:{changes,last_row_id:Number(lastId),duration:0,rows_read:rows.length,rows_written:changes,size_after:0,changed_db:changes>0}};
  }
  async first<T>(column?:string):Promise<T|null>{const row=this.execute().results[0];return (row?(column?row[column]:row):null) as T|null;}
  async all(){return this.execute();}
  async run(){return this.execute();}
}
