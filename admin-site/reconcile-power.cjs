'use strict';
// Site installers may preserve only their own saved stopped state; never run a PM2 "all" command.
const fs=require('node:fs'),{execFileSync}=require('node:child_process'),{sites}=require('./lib/catalog');
const file='/var/lib/hn-control/state.json',id=process.argv[2];if(!sites.some(s=>s.id===id))throw Error('Unknown website.');if(fs.existsSync(file)){const state=JSON.parse(fs.readFileSync(file,'utf8'));const site=sites.find(s=>s.id===id);if(state.sites[site.id]?.power==='off')execFileSync('/usr/bin/pm2',['stop',site.process],{stdio:'inherit'});}
