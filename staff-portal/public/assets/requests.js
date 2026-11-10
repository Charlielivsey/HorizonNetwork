/* Guided requests. Uses the existing helpdesk store and permission-checked APIs. */
(function () {
    'use strict';
    if (document.documentElement.dataset.hnApp) return;
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let active;
    function mount(root, ctx) {
        const {data,icon,state} = ctx;
        const draft = state.requestDraft || (state.requestDraft = {team:'',company:'',category:'other',priority:'normal',subject:'',body:''});
        let step = draft.team ? (draft.company ? 3 : 2) : 1;
        const teams = Object.entries(data.teams);
        const remember = () => { for(const [key,id] of Object.entries({subject:'tk-subject',body:'tk-body',priority:'tk-pri',category:'tk-cat',company:'request-company'})){const field=root.querySelector('#'+id);if(field)draft[key]=field.value;} };
        function go(next, focus) { remember();step=next;draw();if(focus){const title=root.querySelector('.request-stage h2') || root.querySelector('#request-team-title');title.focus({preventScroll:true});title.scrollIntoView({block:'nearest'});} }
        function draw() {
            const team=data.teams[draft.team];
            root.innerHTML='<section class="request-workspace"><div class="request-intro"><div><p class="portal-eyebrow">Find the right team</p><h2 id="request-team-title" tabindex="-1">Who can help?</h2><p>Choose a team, tell us which company it concerns, then describe what you need.</p></div></div>'+
                '<ol class="request-progress" aria-label="Request progress">'+['Choose a team','Brand / company','Request details'].map((label,i)=>'<li'+(step===i+1?' aria-current="step"':'')+'><span>'+(i+1)+'</span>'+label+'</li>').join('')+'</ol>'+
                '<div class="request-team-grid">'+teams.map(([key,value])=>'<button class="request-team-card team-'+key+'" type="button" data-request-team="'+key+'" aria-pressed="'+(draft.team===key)+'"><span class="request-team-icon">'+icon(value.icon)+'</span><strong>'+esc(value.label)+'</strong><span class="request-team-description">'+esc(value.description)+'</span><span class="request-examples">'+value.examples.map(x=>'<span>'+esc(x)+'</span>').join('')+'</span><span class="request-team-next" aria-hidden="true">'+icon('chevronRight')+'</span></button>').join('')+'</div>'+
                (step>1&&team?'<section class="panel request-stage" aria-label="New request">'+
                 '<div class="request-stage-head"><div><p class="portal-eyebrow">Step '+step+' of 3</p><h2 tabindex="-1">'+(step===2?'Which brand or company?':'What would you like to raise?')+'</h2></div><button class="btn btn-ghost btn-small" type="button" data-request-back>'+(step===2?'Change team':'Back to company')+'</button></div>'+
                 '<div class="request-routing"><span>'+icon(team.icon)+esc(team.label)+'</span>'+(step===3?'<span>'+icon('building')+esc(draft.company)+'</span>':'')+'</div>'+
                 (step===2?'<form id="request-company-form" novalidate><label for="request-company">Brand / company</label><select id="request-company" required><option value="">Choose a brand or company</option>'+data.companies.map(company=>'<option value="'+esc(company)+'"'+(draft.company===company?' selected':'')+'>'+esc(company)+'</option>').join('')+'</select><p class="hint">Choose the company this request concerns. You can raise a request about any company in the group.</p><div class="form-error" id="request-company-error" role="alert" hidden></div><div class="request-stage-actions"><button class="btn btn-primary" type="submit">Continue to details '+icon('chevronRight')+'</button></div></form>':
                 '<form id="tk-form" novalidate><p class="request-audience">Your request is shared with you, authorized '+esc(team.label)+' handlers and owners.</p><label for="tk-subject">Summary</label><input type="text" id="tk-subject" maxlength="150" required value="'+esc(draft.subject)+'" placeholder="A short summary of what you need">'+
                 '<div class="grid-2"><div><label for="tk-cat">Category</label><select id="tk-cat">'+Object.entries(team.categories).map(([key,label])=>'<option value="'+key+'"'+(draft.category===key?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></div><div><label for="tk-pri">How urgent?</label><select id="tk-pri">'+Object.entries(data.priorities).map(([key,label])=>'<option value="'+key+'"'+(draft.priority===key?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></div></div>'+
                 '<label for="tk-body">Details</label><textarea id="tk-body" rows="6" maxlength="5000" required placeholder="Explain what happened or what you need, and any details that will help the team respond.">'+esc(draft.body)+'</textarea><div class="form-error" id="tk-error" role="alert" tabindex="-1" hidden></div><div class="request-stage-actions"><button class="btn btn-ghost" type="button" data-request-back>Back</button><button class="btn btn-primary" type="submit">'+icon('plus')+'Raise a issue</button></div></form>')+'</section>':'')+'</section>';
            root.querySelectorAll('[data-request-team]').forEach(button=>button.onclick=()=>{remember();if(draft.team!==button.dataset.requestTeam)draft.category='other';draft.team=button.dataset.requestTeam;go(2,true);});
            root.querySelectorAll('[data-request-back]').forEach(button=>button.onclick=()=>go(step-1,true));
            const companyForm=root.querySelector('#request-company-form');if(companyForm)companyForm.onsubmit=e=>{e.preventDefault();remember();if(!data.companies.includes(draft.company)){const error=root.querySelector('#request-company-error');error.hidden=false;error.textContent='Choose the brand or company this request concerns.';root.querySelector('#request-company').focus();return;}go(3,true);};
            const form=root.querySelector('#tk-form');if(form){
                form.oninput=remember;form.onchange=remember;
                let pending=false;
                form.onsubmit=async e=>{e.preventDefault();if(pending)return;remember();const error=root.querySelector('#tk-error');error.hidden=true;
                    if(!draft.subject.trim()||!draft.body.trim()){error.hidden=false;error.textContent='Add a summary and details before sending your request.';error.focus();return;}
                    pending=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;submit.textContent='Sending request…';
                    try{const result=await ctx.api('/api/helpdesk',{...draft});state.requestDraft=null;ctx.complete(result);}
                    catch(err){error.hidden=false;error.textContent=err.message;error.focus();pending=false;submit.disabled=false;submit.innerHTML=icon('plus')+'Raise a issue';}
                };
            }
        }
        active={root,start:()=>go(1,true)};draw();
    }
    window.HNRequests={mount,start(){if(!active||!active.root.isConnected)return false;active.start();return true;}};
})();
