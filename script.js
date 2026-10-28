/* Plain browser JavaScript. No dependencies or external API calls.
   Facts are dated and linked in index.html. Images/audio are local assets. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const scenes = $$('.scene, .scroll-scene');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hours = $('#hours'), affordability = $('#affordability'), drone = $('#drone');
  let motion = !reduced.matches, sound = false, userScrubbed = false;
  let scheduled = false, audioGraph = null, currentScene = 0, targetVolume = 0;
  let pointer = { x: 0, y: 0 }, activeThought = -1;
  const clamp = value => Math.max(0, Math.min(1, value));
  const progress = element => clamp(-element.getBoundingClientRect().top / Math.max(1, element.offsetHeight - innerHeight));
  const passage = element => clamp((innerHeight - element.getBoundingClientRect().top) / (innerHeight + element.offsetHeight));
  const money = value => value.toLocaleString('en-AU', { style:'currency', currency:'AUD', maximumFractionDigits:2, minimumFractionDigits:2 });

  // A schematic: one of 200 marks = the report's rounded 0.5%, not real listings.
  const grid = $('.window-grid');
  for (let i = 0; i < 200; i++) {
    const mark = document.createElement('i');
    mark.dataset.rank = (i * 73) % 200; // stable visual ordering; no random outcomes
    if (i === 0) mark.className = 'affordable';
    grid.append(mark);
  }
  for (let i = 0; i < 38; i++) $('.work-marks').append(document.createElement('i'));

  function setHours(value) {
    const h = Math.max(0, Math.min(38, Number(value)));
    hours.value = h;
    $('#hours-output').textContent = Number(h.toFixed(1)).toString();
    $('#wage-output').textContent = money(1004.90 * h / 38);
    hours.setAttribute('aria-valuetext', `${h} hours; ${money(1004.90 * h / 38)} gross pay in this illustration`);
    $('#work-line').textContent = h >= 38 ? 'A full week. Still no guarantee.' : 'The hours add up.';
    $$('.work-marks i').forEach((mark,i) => mark.classList.toggle('earned',i<h));
  }
  hours.addEventListener('input', () => {userScrubbed = true;setHours(hours.value)});
  function setHousing() {
    const fraction = Number(affordability.value) / 100;
    [...grid.children].forEach(mark => {
      const threshold = Number(mark.dataset.rank) / 199;
      mark.style.opacity = mark.classList.contains('affordable') ? '1' : String(.04 + .86 * (1 - clamp(fraction * 1.15 - threshold * .15)));
    });
    if (fraction === 0) {
      $('#housing-number').innerHTML = '100<span>%</span>';
      $('#housing-description').textContent = 'Start with the whole rental market.';
    } else if (fraction === 1) {
      $('#housing-number').innerHTML = '0.5<span>%</span>';
      $('#housing-description').textContent = 'Affordable and suitable for a single minimum-wage worker.';
    } else {
      $('#housing-number').textContent = '…';
      $('#housing-description').textContent = 'Narrowing to what was affordable. Keep dragging.';
    }
    affordability.setAttribute('aria-valuetext',fraction === 1 ? '0.5 percent affordable and suitable' : fraction === 0 ? 'All surveyed rental listings' : 'Filtering illustration; drag to the end for the result');
  }
  affordability.addEventListener('input', setHousing);

  // Judgements are constructed dialogue. They are never presented as quotations from research.
  const thoughts = $$('.thought');
  const dragged = new WeakSet();
  thoughts.forEach(button => {
    let drag = null;
    button.addEventListener('pointerdown', event => {
      if(event.button !== 0) return;
      dragged.delete(button);
      drag = {id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,dy:0};
      button.setPointerCapture(event.pointerId);
      button.classList.add('dragging');
    });
    button.addEventListener('pointermove', event => {
      if(!drag || event.pointerId !== drag.id) return;
      drag.dx = event.clientX-drag.x;drag.dy = event.clientY-drag.y;
      button.style.translate = `${drag.dx}px ${drag.dy}px`;
      if(Math.hypot(drag.dx,drag.dy)>12) dragged.add(button);
    });
    const release = event => {
      if(!drag || event.pointerId !== drag.id) return;
      const dismissed = Math.hypot(drag.dx,drag.dy)>85 && event.type !== 'pointercancel';
      drag=null;button.classList.remove('dragging');button.style.translate='';
      if(dismissed && !button.classList.contains('dismissed')) {
        dragged.delete(button);button.click();dragged.add(button);
      }
    };
    button.addEventListener('pointerup',release);
    button.addEventListener('pointercancel',release);
  });
  thoughts.forEach(button => button.addEventListener('click', () => {
    if(dragged.has(button)){dragged.delete(button);return;}
    button.classList.toggle('dismissed');
    button.setAttribute('aria-pressed',String(button.classList.contains('dismissed')));
    const count = thoughts.filter(b => b.classList.contains('dismissed')).length;
    $('#thought-response').textContent = count === 3 ? 'A person. Not an assumption.' : button.classList.contains('dismissed') ? button.dataset.answer : 'Drag a judgement away. Or tap to challenge it.';
    $('#reset-thoughts').hidden = count === 0;
  }));
  $('#reset-thoughts').addEventListener('click', () => {
    thoughts.forEach(button => {button.classList.remove('dismissed');button.setAttribute('aria-pressed','false')});
    $('#thought-response').textContent = 'Drag a judgement away. Or tap to challenge it.';
    $('#reset-thoughts').hidden = true;
  });

  // One credited Pixabay recording. No generated drones or uncredited speech synthesis.
  // Web Audio only filters the downloaded track; HTMLAudio volume is the fallback.
  async function enableSound() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context && !audioGraph) {
        const ctx = new Context(), source = ctx.createMediaElementSource(drone);
        const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
        filter.type = 'lowpass';filter.frequency.value = 650;gain.gain.value = 0;
        source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
        audioGraph = {ctx,filter,gain};
      }
      if (audioGraph) await audioGraph.ctx.resume();
      drone.volume = audioGraph ? 1 : 0;
      await drone.play();
      sound = true;
      $('#sound').textContent = 'Sound on';$('#sound').setAttribute('aria-pressed','true');
      $('#audio-status').hidden = true;update();
      return true;
    } catch (error) {
      sound = false;drone.pause();
      $('#audio-status').textContent = 'Audio could not start. Tap Sound on to retry, or continue silently.';
      $('#audio-status').hidden = false;
      $('#sound').textContent = 'Sound off';$('#sound').setAttribute('aria-pressed','false');
      return false;
    }
  }
  function mute() {
    sound = false;drone.pause();
    if(audioGraph) audioGraph.gain.gain.setValueAtTime(0,audioGraph.ctx.currentTime);
    $('#sound').textContent = 'Sound off';$('#sound').setAttribute('aria-pressed','false');
  }
  $('#sound').addEventListener('click', () => sound ? mute() : enableSound());
  $('#begin-sound').addEventListener('click', async () => {
    await enableSound();$('#without-home').scrollIntoView({behavior:motion?'smooth':'auto'});
  });
  function updateAudio() {
    const quiet = document.hidden || currentScene >= 7 || scrollY >= $('#credits').offsetTop - innerHeight / 2;
    targetVolume = sound && !quiet ? Number(scenes[currentScene].dataset.sound || 0) : 0;
    if(audioGraph) {
      audioGraph.gain.gain.setTargetAtTime(targetVolume,audioGraph.ctx.currentTime,.45);
      audioGraph.filter.frequency.setTargetAtTime(currentScene === 5 ? 1400 : currentScene === 2 ? 1050 : 600,audioGraph.ctx.currentTime,.7);
    } else if(sound) drone.volume = targetVolume;
  }
  const videos = $$('.scene-video');
  const visibleScenes = new Set();
  function syncVideo() {
    videos.forEach(video => {
      const active = motion && !document.hidden && visibleScenes.has(video.closest('.scene, .scroll-scene'));
      if (!active) { video.pause(); return; }
      if (!video.getAttribute('src')) {video.src=video.dataset.src;video.load();}
      video.muted=true;video.play().catch(()=>{});
    });
  }
  videos.forEach(video=>video.addEventListener('playing',()=>video.classList.add('playing')));
  const sceneObserver = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      entry.target.classList.toggle('in-view',entry.isIntersecting);
      if(entry.isIntersecting) visibleScenes.add(entry.target);else visibleScenes.delete(entry.target);
    });
    syncVideo();
  },{threshold:0});
  scenes.forEach(scene=>sceneObserver.observe(scene));
  document.addEventListener('visibilitychange',syncVideo);
  addEventListener('pagehide',()=>videos.forEach(video=>video.pause()));
  function setMotion() {
    document.body.classList.toggle('still',!motion);
    $('#motion').textContent = motion ? 'Motion on' : 'Motion off';
    $('#motion').setAttribute('aria-pressed',String(motion));syncVideo();schedule();
  }
  $('#motion').addEventListener('click', () => {motion=!motion;setMotion()});
  reduced.addEventListener('change', () => {motion=!reduced.matches;setMotion()});
  function update() {
    scheduled = false;
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    $('#progress').style.width = clamp(scrollY / Math.max(1,maxScroll))*100+'%';
    currentScene = Math.max(0,scenes.findLastIndex(scene => scene.getBoundingClientRect().top < innerHeight*.45));
    $('#chapter-label').textContent = `${String(currentScene+1).padStart(2,'0')} / ${scenes[currentScene].dataset.title}`;
    scenes.forEach(scene => {
      const image = scene.querySelector('.shot img');
      if(image) image.style.transform = motion ? `scale(${1.08+passage(scene)*.06}) translate(${pointer.x*7}px,${(passage(scene)-.5)*-35+pointer.y*5}px)` : 'none';
    });
    const jp = progress($('#judgement'));
    activeThought = Math.min(2,Math.floor(jp*3));
    thoughts.forEach((button,i) => {
      const delta = i - jp*3 + .5;
      button.style.transform = motion ? `translate(${delta*(i%2?-35:35)}px,${delta*18}px) rotate(${delta*1.8}deg)` : 'none';
      button.classList.toggle('active',i===activeThought);
    });
    if(!userScrubbed) setHours(Math.round(progress($('#work'))*76)/2);
    $('.strike').style.setProperty('--strike', motion ? clamp((passage($('#ending'))-.2)*3) : 1);
    updateAudio();
  }
  function schedule() {if(!scheduled){scheduled=true;requestAnimationFrame(update)}}
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);
  addEventListener('pointermove',event=>{if(motion&&event.pointerType==='mouse'){pointer={x:event.clientX/innerWidth-.5,y:event.clientY/innerHeight-.5};schedule()}},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)drone.pause();else if(sound)drone.play().catch(mute);updateAudio()});
  addEventListener('pagehide',mute);
  setHousing();setMotion();update();
})();
