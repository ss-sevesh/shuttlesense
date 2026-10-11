import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { localRequest } from '@/lib/analysis-jobs';
import { validateProfile } from '@/lib/player-profile';
import { boundedJson,readLocalJson,writeLocalJson } from '@/lib/local-json';
export const runtime='nodejs';
const profilePath=join(process.cwd(),'data/player/profile.json');
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request) {
  if(!localRequest(request))return Response.json({error:'Local profile only.'},{status:403});
  try {const stored=await readLocalJson(profilePath);return Response.json({profile:stored?validateProfile(stored):null},{headers});}
  catch{return Response.json({error:'Profile could not be read. No data was replaced.'},{status:500,headers});}
}
export async function PUT(request:Request) {
  if(!localRequest(request,true))return Response.json({error:'Local profile only.'},{status:403});
  let profile;try {profile=validateProfile(await boundedJson(request));}
  catch{return Response.json({error:'Invalid or oversized profile.'},{status:400,headers});}
  try {await writeLocalJson(profilePath,profile);return Response.json({profile},{headers});}
  catch{return Response.json({error:'Profile could not be saved. Retry.'},{status:500,headers});}
}
export async function DELETE(request:Request) {
  if(!localRequest(request,true))return Response.json({error:'Local profile only.'},{status:403});
  try {await unlink(profilePath).catch(error=>{if(error.code!=='ENOENT')throw error;});return Response.json({deleted:true},{headers});}
  catch{return Response.json({error:'Profile could not be deleted. Retry.'},{status:500,headers});}
}
