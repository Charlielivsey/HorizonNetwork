# HN Group mail: Rspamd's controller only on this server (no web interface is published).
bind_socket = "127.0.0.1:11334";
.include(try=true; priority=10) "/etc/hn-mail/rspamd/controller-password.inc"
