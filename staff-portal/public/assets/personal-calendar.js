/* Personal calendars and authorized annual-leave availability. */
(function () {
    'use strict';
    if (document.documentElement.dataset.hnApp) return;
    const escape = s => String(s == null ? '' : s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const kinds = [ ['events','Events & meetings'],['annual','Annual leave'],['sick','Sickness'],['absence','Other absence'],['holidays','Holidays'],['celebrations','Celebrations'] ];
    const category = item => item.kind==='sick'?'sick':item.kind==='leave'?(item.leaveType==='annual'?'annual':'absence'):item.kind==='bank-holiday'||item.type==='holiday'?'holidays':['birthday','anniversary'].includes(item.kind)?'celebrations':'events';
    const dateLabel = day => new Date(day+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
    async function render(root,current,ctx) {
        const {state,api,icon,isoDay}=ctx;
        if(state.pendingCalendarDate){state.calendarMonth=state.pendingCalendarDate.slice(0,7);state.pendingCalendarDate=null;}
        const month=state.calendarMonth || isoDay(new Date()).slice(0,7),[year,number]=month.split('-').map(Number);
        const first=new Date(year,number-1,1),start=new Date(first);start.setDate(1-((first.getDay()+6)%7));
        const end=new Date(start);end.setDate(end.getDate()+41);
        const scope=state.personalCalendarScope || {view:'personal'};
        const query=new URLSearchParams({from:isoDay(start),to:isoDay(end),...scope});
        let data;
        try { data=await api('/api/calendar?'+query); }
        catch(error){
            if(!current())return;
            if(scope.view==='personal')throw error;
            root.innerHTML='<section class="panel calendar-denied"><h1>This calendar is unavailable</h1><p>'+escape(error.message)+'</p><button class="btn btn-primary" id="calendar-back-personal" type="button">Back to my calendar</button></section>';
            root.querySelector('button').onclick=()=>{state.personalCalendarScope={view:'personal'};ctx.render();};return;
        }
        if(!current())return;
        state.calendarPeople=data.eventPeople || [];
        const availability=data.scope.access==='annual-only',hidden=new Set(state.calendarHiddenKinds || []);
        const filtered=data.items.filter(item=>!hidden.has(category(item))),byDay={},byId={};
        for(const item of filtered){byId[item.id]=item;for(let day=new Date(item.startDate+'T12:00:00');isoDay(day)<=item.endDate;day.setDate(day.getDate()+1)){
            const key=isoDay(day);if(key>=isoDay(start)&&key<=isoDay(end))(byDay[key] || (byDay[key]=[])).push(item);
        }}
        const today=isoDay(new Date()),layout=state.personalCalendarLayout || (matchMedia('(max-width:760px)').matches?'agenda':'month');
        const event=item=>'<button type="button" class="personal-calendar-event cat-'+category(item)+(item.status==='pending'?' is-pending':'')+'" data-calendar-item="'+escape(item.id)+'">'+(item.startTime?'<time>'+escape(item.startTime)+'</time>':'')+'<span>'+escape(item.title)+'</span>'+(item.halfDay?'<small>'+escape(item.halfDay.toUpperCase())+'</small>':'')+'</button>';
        let cells='';
        for(let i=0;i<42;i++){const day=new Date(start);day.setDate(day.getDate()+i);const key=isoDay(day),items=byDay[key]||[];
            cells+='<div class="personal-calendar-day'+(day.getMonth()!==number-1?' is-other':'')+(key===today?' is-today':'')+'"><button class="calendar-date" type="button" data-calendar-day="'+key+'" aria-label="'+escape(dateLabel(key))+'">'+day.getDate()+'</button><div>'+items.slice(0,3).map(event).join('')+(items.length>3?'<button type="button" class="calendar-more" data-calendar-day="'+key+'">+'+(items.length-3)+' more</button>':'')+'</div></div>';
        }
        const days=Object.keys(byDay).filter(key=>key.slice(0,7)===month).sort();
        const selected=state.personalCalendarDay && state.personalCalendarDay.slice(0,7)===month?state.personalCalendarDay:null;
        const agenda=(selected?[selected]:days).map(day=>'<section class="calendar-agenda-day"><h3>'+escape(dateLabel(day))+'</h3>'+(byDay[day]||[]).map(event).join('')+(!(byDay[day]||[]).length?'<p class="muted small">Nothing scheduled for this day.</p>':'')+'</section>').join('');
        root.innerHTML='<div class="page-head"><div><h1>'+escape(scope.view==='personal'?'My calendar':data.scope.label)+'</h1><p class="muted">'+(availability?'Approved annual-leave availability only. Personal events and sickness are private.':'Your annual leave, sickness and absence from HR, alongside the meetings and events shared with you.')+'</p></div><div class="page-actions">'+(data.calendars.canViewOthers?'<button class="btn btn-ghost" id="calendar-choose-person" type="button">'+icon('users')+'View another person</button>':'')+(data.canManage?'<button class="btn btn-primary" id="new-event" type="button">'+icon('plus')+'Add event</button>':'')+'</div></div>'+
            '<section class="panel personal-calendar-controls"><div class="calendar-scopes" aria-label="Calendar scope"><button type="button" class="btn '+(scope.view==='personal'?'btn-primary':'btn-ghost')+'" data-calendar-scope="personal">'+icon('user')+'My calendar</button>'+(data.calendars.reports?'<button type="button" class="btn '+(scope.view==='reports'?'btn-primary':'btn-ghost')+'" data-calendar-scope="reports">Direct reports <span class="badge">'+data.calendars.reports+'</span></button>':'')+data.calendars.teams.map(t=>'<button type="button" class="btn '+(scope.view==='team'&&scope.team===t.id?'btn-primary':'btn-ghost')+'" data-calendar-scope="team" data-calendar-team="'+t.id+'">'+escape(t.label)+' annual leave</button>').join('')+'</div>'+
            (data.calendars.canViewOthers&& (state.personalCalendarPicking||scope.view==='person')?'<div class="calendar-person-field"><label for="calendar-person">Person’s calendar</label><select id="calendar-person"><option value="">Choose a staff member</option>'+data.calendars.people.map(p=>'<option value="'+p.id+'"'+(scope.person===p.id?' selected':'')+'>'+escape(p.displayName+' · '+p.company)+'</option>').join('')+'</select><p class="hint">Owner and system-administrator access. These calendars may include private events and sickness.</p></div>':'')+
            '<div class="calendar-filters" aria-label="Event types">'+kinds.filter(k=>!availability||k[0]==='annual').map(([key,label])=>'<label class="calendar-filter cat-'+key+'"><input type="checkbox" data-calendar-filter="'+key+'"'+(hidden.has(key)?'':' checked')+'><span>'+label+'</span></label>').join('')+'<span class="calendar-pending-key">Dashed outline: pending leave</span></div></section>'+
            '<div class="personal-calendar-layout"><section class="panel personal-calendar-board"><div class="personal-calendar-toolbar"><div class="btn-row"><button type="button" class="icon-btn" id="cal-prev" aria-label="Previous month">'+icon('chevronLeft')+'</button><button type="button" class="btn btn-ghost btn-small" id="cal-today">Today</button><button type="button" class="icon-btn" id="cal-next" aria-label="Next month">'+icon('chevronRight')+'</button></div><h2>'+escape(first.toLocaleDateString('en-GB',{month:'long',year:'numeric'}))+'</h2><div class="segmented" aria-label="Calendar layout"><button type="button" data-calendar-layout="month" class="'+(layout==='month'?'active':'')+'">Month</button><button type="button" data-calendar-layout="agenda" class="'+(layout==='agenda'?'active':'')+'">Agenda</button></div></div>'+
            (layout==='month'?'<div class="personal-calendar-scroll"><div class="personal-calendar-grid">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>'<div class="calendar-weekday">'+d+'</div>').join('')+cells+'</div></div>':'<div class="calendar-agenda">'+(agenda||'<div class="empty-page"><h2>Nothing scheduled this month</h2><p>Your leave, meetings and events will appear here when they are recorded.</p></div>')+'</div>')+
            '<div class="calendar-sync"><span id="calendar-sync-status" role="status">Live from HR and the group calendar · refreshes every 20 seconds</span><button type="button" class="btn btn-ghost btn-small" id="calendar-refresh">Refresh</button></div></section>'+
            '<aside class="panel personal-calendar-summary"><h2>'+ (selected?escape(dateLabel(selected)):'This month')+'</h2>'+(selected?'<button class="btn btn-ghost btn-small" type="button" id="calendar-all-days">Show all days</button>':'')+'<p class="muted small">'+escape(availability?'Annual leave for your authorized team.':'Only your own leave and events you can attend appear by default.')+'</p><div class="calendar-agenda">'+(agenda||'<p class="muted small">Nothing scheduled this month.</p>')+'</div>'+(data.canManage&&selected?'<button class="btn btn-ghost" type="button" id="calendar-add-day">Add event on this day</button>':'')+'</aside></div>';
        const go=next=>{state.personalCalendarScope=next;state.personalCalendarDay=null;ctx.render();};
        root.querySelectorAll('[data-calendar-scope]').forEach(button=>button.onclick=()=>go({view:button.dataset.calendarScope,...(button.dataset.calendarTeam?{team:button.dataset.calendarTeam}:{})}));
        const person=root.querySelector('#calendar-person');if(person)person.onchange=()=>{if(person.value)go({view:'person',person:person.value});};
        const choose=root.querySelector('#calendar-choose-person');if(choose)choose.onclick=()=>{state.personalCalendarPicking=!state.personalCalendarPicking;ctx.render();};
        root.querySelectorAll('[data-calendar-filter]').forEach(input=>input.onchange=()=>{if(input.checked)hidden.delete(input.dataset.calendarFilter);else hidden.add(input.dataset.calendarFilter);state.calendarHiddenKinds=[...hidden];ctx.render();});
        root.querySelectorAll('[data-calendar-layout]').forEach(button=>button.onclick=()=>{state.personalCalendarLayout=button.dataset.calendarLayout;ctx.render();});
        const shift=delta=>{state.calendarMonth=isoDay(new Date(year,number-1+delta,1)).slice(0,7);state.personalCalendarDay=null;ctx.render();};
        root.querySelector('#cal-prev').onclick=()=>shift(-1);root.querySelector('#cal-next').onclick=()=>shift(1);root.querySelector('#cal-today').onclick=()=>{state.calendarMonth=null;state.personalCalendarDay=today;ctx.render();};
        root.querySelector('#calendar-refresh').onclick=ctx.render;
        if(root.querySelector('#calendar-all-days'))root.querySelector('#calendar-all-days').onclick=()=>{state.personalCalendarDay=null;ctx.render();};
        if(root.querySelector('#new-event'))root.querySelector('#new-event').onclick=()=>ctx.openEventForm(null,today);
        if(root.querySelector('#calendar-add-day'))root.querySelector('#calendar-add-day').onclick=()=>ctx.openEventForm(null,selected);
        root.addEventListener('click',event=>{const item=event.target.closest('[data-calendar-item]');if(item)return ctx.openCalendarItem(byId[item.dataset.calendarItem]);const day=event.target.closest('[data-calendar-day]');if(day){state.personalCalendarDay=day.dataset.calendarDay;ctx.render();}});
        const signature=JSON.stringify(data);
        async function refresh(){
            if(!root.isConnected||!current())return;
            if(!document.hidden)try{const next=await api('/api/calendar?'+query);if(!current())return;if(JSON.stringify(next)!==signature)return ctx.render();}catch(e){if(current())return ctx.render();}
            setTimeout(refresh,20000);
        }
        setTimeout(refresh,20000);
    }
    function eventFields(value,people){return '<label for="ev-visibility">Who is this event for?</label><select id="ev-visibility"><option value="company"'+(value.visibility!=='private'?' selected':'')+'>Company audience below</option><option value="private"'+(value.visibility==='private'?' selected':'')+'>Private · selected attendees</option></select><fieldset class="calendar-attendees" id="ev-attendees"'+(value.visibility==='private'?'':' hidden')+'><legend>Attendees</legend>'+ (people||[]).map(p=>'<label><input type="checkbox" name="ev-attendee" value="'+p.id+'"'+((value.attendeeIds||[]).includes(p.id)?' checked':'')+'><span>'+escape(p.displayName)+'<small>'+escape(p.company)+'</small></span></label>').join('')+'</fieldset>';}
    window.HNPersonalCalendar={render,eventFields};
})();
