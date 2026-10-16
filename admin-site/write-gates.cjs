'use strict';
const fs=require('node:fs'),path=require('node:path');const{sites}=require('./lib/catalog');
const root=process.env.CONTROL_NGINX_DIR||'/etc/nginx/hn-control/enabled',port=Number(process.env.CONTROL_GATE_PORT||4700),secret=fs.readFileSync(process.env.CONTROL_EDGE_SECRET_FILE||'/var/lib/hn-control/edge-secret','utf8').trim();
if(!/^[a-f0-9]{64}$/.test(secret)||!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid control integration settings.');fs.mkdirSync(root,{recursive:true,mode:0o755});
for(const site of sites){const headers=`        proxy_set_header X-HN-Control-Key "${secret}";
        proxy_set_header X-HN-Control-Site "${site.id}";
        proxy_set_header X-HN-Control-Host $host;
        proxy_set_header X-HN-Original-URI $request_uri;
        proxy_set_header Cookie $http_cookie;
        proxy_set_header X-Real-IP $remote_addr;`;
const text=`# HN Group central website control. The control panel and private account service have no such gate.
auth_request /__hn_control/gate;
auth_request_set $hn_control_action $upstream_http_x_hn_control_action;
error_page 403 = @hn_control_hold;
location = /__hn_control/gate {
        internal;
        auth_request off;
        proxy_pass http://127.0.0.1:${port}/_edge/gate;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
${headers}
        proxy_connect_timeout 2s;
        proxy_read_timeout 8s;
}
location ^~ /__hn_control/ {
        auth_request off;
        proxy_pass http://127.0.0.1:${port};
${headers}
        proxy_connect_timeout 2s;
        proxy_read_timeout 8s;
}
location @hn_control_hold {
        auth_request off;
        if ($hn_control_action = shutdown) { return 444; }
        proxy_pass http://127.0.0.1:${port};
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-HN-Control-Render "1";
${headers}
        proxy_connect_timeout 2s;
        proxy_read_timeout 8s;
}
`;
fs.writeFileSync(path.join(root,site.id+'-gate.conf'),text,{mode:0o640});}
