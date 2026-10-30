// The private wiki: the wiki's code (wiki-site) in private mode, with its own pages, data and sign-ins, following the
// private register (port 5610) only.
module.exports={apps:[{name:'hn-private-wiki',script:'/opt/hn-private-wiki/server.js',cwd:'/opt/hn-private-wiki',instances:1,exec_mode:'fork',autorestart:true,max_memory_restart:'256M',env:{NODE_ENV:'production',HOST:'127.0.0.1',PORT:5620,
  WIKI_DATA_DIR:'/var/lib/hn-private-wiki',WIKI_PUBLIC_DIR:'/opt/hn-private-wiki/public',WIKI_SEED_DIR:'/opt/hn-private-wiki/seed',WIKI_SESSIONS_FILE:'/var/lib/hn-private-wiki/sessions.json',
  WIKI_PRIVATE:'1',WIKI_NAME:'HN Group Private Wiki',WIKI_AUTH_CLIENT:'private-wiki',WIKI_ORIGIN:'https://private.wiki.hngroup.org.uk',AUTH_ORIGIN:'https://auth.hngroup.org.uk',AUTH_BACKEND:'http://127.0.0.1:3400',STATUS_SSO_SECRET_FILE:'/var/lib/hn-status-sso/secret',
  COMPANIES_FEED_URL:'http://127.0.0.1:5610/api/public/companies',COMPANIES_PUBLIC_URL:'https://private.companies.hngroup.org.uk'}}]};
