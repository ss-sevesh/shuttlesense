import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
export async function readLocalJson(path:string) {
  try{return JSON.parse(await readFile(path,'utf8'));}
  catch(error){if(error && typeof error==='object' && 'code' in error && error.code==='ENOENT')return null;throw error;}
}
export async function writeLocalJson(path:string,value:unknown) {
  await mkdir(dirname(path),{recursive:true});
  const temporary=path+'.'+crypto.randomUUID()+'.tmp';
  await writeFile(temporary,JSON.stringify(value),{mode:0o600});await rename(temporary,path);
}
export async function boundedJson(request:Request,max=16384) {
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new Error('JSON content type required.');
  const reader=request.body?.getReader();if(!reader)throw new Error('Missing body.');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max){await reader.cancel();throw new Error('Request too large.');}chunks.push(part.value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
