'use strict';
// Exactly one private staff-account backend; never an HTTP power-control target.
const fs=require('node:fs');
const options=JSON.parse(fs.readFileSync(process.env.AUTH_ACCOUNTS_CONFIG||'/var/lib/hn-auth/accounts-env.json','utf8'));
Object.assign(process.env,options,{HOST:'127.0.0.1',PORT:String(process.env.AUTH_PRIVATE_PORT||3250),HN_CONTROL_MANAGED:'1'});
require(process.env.AUTH_STAFF_SERVER||'/opt/hn-staff-portal/server.js');
