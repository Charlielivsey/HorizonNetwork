-- HN Group mail: a signed-in mailbox may only put addresses it is allowed to send as in the From header (the same
-- list Postfix uses for the envelope sender: its own addresses, and shared mailboxes it may send as). The list is
-- /etc/hn-mail/rspamd/senders.map, written by the mail directory; Rspamd reloads it when it changes.
local senders = rspamd_config:add_map({
  type = 'map',
  url = '/etc/hn-mail/rspamd/senders.map',
  description = 'HN Group mail: addresses each mailbox may send as',
})
rspamd_config:register_symbol({
  name = 'HN_FROM_NOT_ALLOWED',
  type = 'prefilter',
  priority = 10,
  callback = function(task)
    local user = task:get_user()
    if not user then return end
    user = string.lower(user):gsub('%*.*$', '')
    local from = task:get_from('mime')
    if not from or not from[1] then
      task:set_pre_result('reject', 'Your message needs a From address', 'hn_from')
      return
    end
    local allowed = senders:get_key(user) or ''
    for _, f in ipairs(from) do
      local addr = string.lower(f.addr or '')
      local ok = false
      for a in string.gmatch(allowed, '[^,%s]+') do
        if a == addr then ok = true end
      end
      if not ok then
        task:insert_result('HN_FROM_NOT_ALLOWED', 1.0, addr)
        task:set_pre_result('reject', 'You are not allowed to send as ' .. addr, 'hn_from')
        return
      end
    end
  end,
})
rspamd_config:set_metric_symbol({ name = 'HN_FROM_NOT_ALLOWED', score = 0.0, group = 'hn' })
