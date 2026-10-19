'use strict';
// HN Browser draws its menus, find box and messages in a transparent overlay page above the website.
// Returns that page (Playwright sees it as another window).
module.exports.overlayOf=async app=>{for(let i=0;i<200;i++){const page=app.windows().find(w=>w.url().includes('workspace.html?layer=overlay'));if(page){await page.waitForFunction(()=>!!document.querySelector('#version'));return page;}await new Promise(r=>setTimeout(r,50));}throw Error('The overlay layer never appeared.');};
