/* script.js - shared logic for meals, planner and shopping */
async function loadMealsArray(){
  if(window._mealsCache) return window._mealsCache;
  try{
    const res = await fetch('meals.html');
    const txt = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(txt,'text/html');
    const nodes = Array.from(doc.querySelectorAll('.meal'));
    const meals = nodes.map((n, idx)=>{
      const title = n.querySelector('h3')?.innerText?.trim() || ('Bez nazwy '+idx);
      const category = (n.dataset.category||'').toLowerCase();
      const macroRaw = n.dataset.macro || '';
      const macroParts = macroRaw.split('|').map(x=>x?Number(x):0);
      const macro = {kcal:macroParts[0]||0, protein:macroParts[1]||0, fat:macroParts[2]||0, carbs:macroParts[3]||0};
      const ingredientsEl = Array.from(n.querySelectorAll('p')).find(p=>/składnik/i.test(p.innerText) || /skladnik/i.test(p.innerText));
      const ingredientsText = ingredientsEl ? ingredientsEl.innerText.replace(/Składniki[:]?\s*/i,'').trim() : n.innerText;
      return {index:idx, title, category, macro, ingredientsText, html:n.innerHTML};
    });
    window._mealsCache = meals;
    return meals;
  }catch(err){console.error('loadMealsArray error',err);return[];}
}

document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    if(document.querySelector('.grid-meals')){
      const meals = await loadMealsArray();
      const grid = document.querySelector('.grid-meals');
      const search = document.getElementById('search');
      const filter = document.getElementById('filter-section');
      const render = ()=>{
        const q = (search?.value||'').toLowerCase();
        const f = (filter?.value||'all');
        Array.from(grid.querySelectorAll('.meal')).forEach(mEl=>{
          const cat = (mEl.dataset.category||'') ;
          const t = mEl.querySelector('h3')?.innerText?.toLowerCase()||'';
          const show = (f==='all' || cat.includes(f)) && (q==='' || t.includes(q));
          mEl.style.display = show?'block':'none';
        });
      };
      search?.addEventListener('input', render);
      filter?.addEventListener('change', render);
    }
  }catch(e){console.error(e)}
});

/* Planner functionality */
function initPlanner(opts={days:5}){
  loadMealsArray().then(meals=>{ window._plannerMeals = meals; buildPlannerGrid(opts.days||5); loadPlan(); });
}
function buildPlannerGrid(days){
  const grid = document.getElementById('plannerGrid');
  // remove existing extras
  Array.from(grid.querySelectorAll('.slot, .day-summary')).forEach(n=>n.remove());
  const slots = ['Śniadanie','Obiad','Kolacja'];
  for(let s=0;s<slots.length;s++){
    for(let d=0; d<days; d++){
      const el = document.createElement('div');
      el.className='slot empty';
      el.dataset.day = d; el.dataset.slot = s;
      el.innerHTML = `<div class="slot-title">${slots[s]}</div><div class="slot-content">Brak</div><button class="remove" style="position:absolute;top:8px;right:10px;display:none">✕</button>`;
      el.addEventListener('click', ()=> openMealModal(el));
      el.querySelector('.remove').addEventListener('click', (ev)=>{ ev.stopPropagation(); clearSlot(d,s); });
      grid.appendChild(el);
    }
  }
  // summary
  const summLabel = document.createElement('div'); summLabel.className='col-head small day-summary'; summLabel.textContent='Podsumowanie'; grid.appendChild(summLabel);
  for(let d=0; d<days; d++){
    const s = document.createElement('div'); s.className='slot summary small day-summary'; s.style.minHeight='44px'; s.innerHTML=`<div class="day-sum" data-day="${d}">0 kcal</div>`; grid.appendChild(s);
  }
  updateGridFromPlan();
}

const PLAN_KEY = 'plan_posilkow_v1';
let plan = null;
function loadPlan(){
  try{ const raw=localStorage.getItem(PLAN_KEY); if(raw) plan=JSON.parse(raw); }catch(e){}
  if(!plan) plan = Array.from({length:5}, ()=> [null,null,null]);
  updateGridFromPlan();
}
function savePlan(){ localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); alert('Plan zapisany lokalnie.'); }
function clearSlot(day,slot){ plan[day][slot]=null; savePlan(); updateGridFromPlan(); }
function updateGridFromPlan(){
  const slots = document.querySelectorAll('.slot');
  slots.forEach(el=>{
    const day = Number(el.dataset.day); const slot = Number(el.dataset.slot);
    const mealIndex = (plan && plan[day]) ? plan[day][slot] : null;
    const content = el.querySelector('.slot-content'); const removeBtn = el.querySelector('.remove');
    if(mealIndex===null || mealIndex===undefined){ el.classList.remove('assigned'); el.classList.add('empty'); content.textContent='Brak'; removeBtn.style.display='none'; }
    else { el.classList.remove('empty'); el.classList.add('assigned'); const meal = window._plannerMeals && window._plannerMeals[mealIndex]; content.textContent = meal?meal.title:'Brak'; removeBtn.style.display='block'; }
  });
  updateDailySummaries();
}
function updateDailySummaries(){
  for(let d=0; d<plan.length; d++){
    let kcal=0,protein=0,fat=0,carbs=0;
    for(let s=0;s<3;s++){
      const mi = plan[d][s];
      if(mi!==null && window._plannerMeals && window._plannerMeals[mi]){
        const m = window._plannerMeals[mi].macro || {kcal:0,protein:0,fat:0,carbs:0};
        kcal+=Number(m.kcal)||0; protein+=Number(m.protein)||0; fat+=Number(m.fat)||0; carbs+=Number(m.carbs)||0;
      }
    }
    const el = document.querySelector('.day-sum[data-day="'+d+'"]');
    if(el) el.innerText = `${Math.round(kcal)} kcal | ${Math.round(protein)}B | ${Math.round(fat)}T | ${Math.round(carbs)}W`;
  }
}

let currentSlotEl=null;
function openMealModal(slotEl){ currentSlotEl=slotEl; document.getElementById('mealModal').classList.add('active'); renderModalMeals(); }
function closeMealModal(){ document.getElementById('mealModal').classList.remove('active'); currentSlotEl=null; }
document.addEventListener('click',(e)=>{ if(e.target.id==='closeModal') closeMealModal(); });

async function renderModalMeals(){
  const meals = await loadMealsArray();
  const container = document.getElementById('modalMeals'); container.innerHTML='';
  const q = document.getElementById('modalSearch')?.value?.toLowerCase()||''; const f = document.getElementById('modalFilter')?.value||'all';
  meals.forEach(m=>{ if(f!=='all' && m.category && !m.category.includes(f)) return; if(q && !m.title.toLowerCase().includes(q)) return;
    const card = document.createElement('div'); card.className='meal-card';
    card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong>${m.title}</strong><span class="badge">${m.category||''}</span></div><div style="margin-top:6px;color:var(--muted);font-size:13px">🔥 ${m.macro.kcal||'-'} kcal · 🥩 ${m.macro.protein}B · 🧈 ${m.macro.fat}T · 🌾 ${m.macro.carbs}W</div>`;
    card.addEventListener('click',()=>{ assignMealToSlot(m.index); closeMealModal(); }); container.appendChild(card);
  });
  document.getElementById('modalSearch')?.addEventListener('input', renderModalMeals); document.getElementById('modalFilter')?.addEventListener('change', renderModalMeals);
}

function assignMealToSlot(mealIndex){ if(!currentSlotEl) return; const day=Number(currentSlotEl.dataset.day); const slot=Number(currentSlotEl.dataset.slot); plan[day][slot]=mealIndex; savePlan(); updateGridFromPlan(); }

function generateShoppingFromPlan(){ const used=new Set(); for(let d=0; d<plan.length; d++) for(let s=0;s<3;s++){ const mi=plan[d][s]; if(mi!==null) used.add(mi); } if(used.size===0){ alert('Plan jest pusty.'); return; }
  const meals = window._plannerMeals || []; let ingredients = [];
  used.forEach(idx=>{ const m = meals[idx]; if(!m) return; const lines = m.ingredientsText.split('\\n').map(x=>x.trim()).filter(Boolean); const cleaned = lines.map(l=>l.replace(/Składniki[:]?/i,'').trim()).filter(Boolean); ingredients.push(...cleaned); });
  const norm = ingredients.map(s=>s.replace(/\\s+/g,' ').trim()).filter(Boolean);
  const unique = Array.from(new Set(norm.map(s=>s.toLowerCase()))).map(s=> norm.find(x=>x.toLowerCase()===s) || s );
  localStorage.setItem('plan_shopping_items', JSON.stringify(unique));
  window.location.href = 'shopping.html';
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('savePlanBtn')?.addEventListener('click', savePlan);
  document.getElementById('exportBtn')?.addEventListener('click', generateShoppingFromPlan);
});
