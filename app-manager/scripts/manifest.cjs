'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const version=process.env.VERSION,tag=process.env.TAG,build=Number(process.env.GITHUB_RUN_NUMBER);
if(!/^\d+\.\d+\.\d+$/.test(version)||tag!=='app-manager-v'+version+'-'+build)throw Error('Invalid release metadata.');
for(const[platform,suffix]of[['mac','mac-universal.zip'],['windows','win-x64.exe'],['linux','linux-x86_64.AppImage']]){const name='HN-Group-App-Manager-'+version+'-'+suffix,data=fs.readFileSync(path.join('installers',name));fs.writeFileSync('downloads-site/app-manager-'+platform+'.json',JSON.stringify({tag,version,build,publishedAt:new Date().toISOString(),asset:{name,size:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')}},null,1)+'\n');}
