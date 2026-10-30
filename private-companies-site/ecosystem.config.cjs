// The private Company Register: the Company Register's code (companies-site) in private mode, with its own data.
module.exports={apps:[{name:'hn-private-companies',script:'/opt/hn-private-companies/server.js',cwd:'/opt/hn-private-companies',instances:1,exec_mode:'fork',autorestart:true,max_memory_restart:'256M',env:{NODE_ENV:'production',HOST:'127.0.0.1',PORT:5610,
  COMPANIES_DATA_DIR:'/var/lib/hn-private-companies',COMPANIES_PUBLIC_DIR:'/opt/hn-private-companies/public',COMPANIES_ORIGIN:'https://private.companies.hngroup.org.uk',
  COMPANIES_PRIVATE:'1',COMPANIES_SEED:'off',COMPANIES_GROUP_UPDATES:'off',COMPANIES_AUTH_CLIENT:'private-companies',AUTH_ORIGIN:'https://auth.hngroup.org.uk',AUTH_BACKEND:'http://127.0.0.1:3400',STATUS_SSO_SECRET_FILE:'/var/lib/hn-status-sso/secret'}}]};
