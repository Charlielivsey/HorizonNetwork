module.exports={apps:[{name:'hn-hr',script:'/opt/hn-hr/server.js',cwd:'/opt/hn-hr',instances:1,exec_mode:'fork',autorestart:true,max_memory_restart:'192M',env:{NODE_ENV:'production',PORT:5680}}]};
