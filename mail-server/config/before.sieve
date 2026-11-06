require ["envelope", "subaddress", "fileinto", "imap4flags", "mailbox"];
# HN Group mail, run before every mailbox's own rules.
# 1. Shared mailboxes keep one shared Sent folder: every message sent as a shared address (from HN Mail or a mail app)
#    is copied to <shared>+hn-sent@ by Postfix (sender_bcc_maps) and filed here as already read. Outside mail can't use
#    this address (Postfix refuses +hn-sent recipients from the internet).
if envelope :detail "to" "hn-sent" {
  addflag "\\Seen";
  fileinto :create "Sent";
  stop;
}
# 2. Mail Rspamd marked as probable spam goes to Junk (emptied after 30 days); it is never silently deleted.
if anyof (header :is "X-Spam" "Yes", header :contains "X-Spam-Status" "Yes,") {
  fileinto :create "Junk";
  stop;
}
