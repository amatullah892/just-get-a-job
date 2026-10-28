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

  // Licensed Pixabay bed plus original procedural sound design (credited in HTML).
  let soundRequest=0, lastCue=0, mixVolume=.55;
  const mixProfiles=[
    [.026,.003,.003,.002], [.003,.028,.008,.004],
    [.002,.018,.012,.018], [.001,.009,.04,.005],
    [.032,.003,.007,.007], [.001,.022,.018,.022],
    [.001,.014,.016,.003], [0,0,0,0]
  ];
  function makeSoundGraph() {
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context) return null;
    const ctx=new Context(), master=ctx.createGain(), limiter=ctx.createDynamicsCompressor();
    master.gain.value=0;limiter.threshold.value=-20;limiter.knee.value=20;limiter.ratio.value=4;
    master.connect(limiter);limiter.connect(ctx.destination);
    const source=ctx.createMediaElementSource(drone), filter=ctx.createBiquadFilter(), gain=ctx.createGain();
    filter.type='lowpass';filter.frequency.value=650;gain.gain.value=0;
    source.connect(filter);filter.connect(gain);gain.connect(master);
    const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate), samples=buffer.getChannelData(0);
    let smoothed=0;
    for(let i=0;i<samples.length;i++){smoothed=(smoothed+.035*(Math.random()*2-1))/1.035;samples[i]=smoothed*4;}
    const layers=[];
    function noise(type,hz,q){
      const n=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
      n.buffer=buffer;n.loop=true;f.type=type;f.frequency.value=hz;f.Q.value=q;g.gain.value=0;
      n.connect(f);f.connect(g);g.connect(master);n.start();layers.push(g);return f;
    }
    noise('bandpass',1800,.6); // soft steam / room air
    const air=noise('lowpass',650,.4);
    noise('lowpass',180,.6); // rail / distant city rumble
    const tension=ctx.createGain();tension.gain.value=0;tension.connect(master);layers.push(tension);
    [110,164.8].forEach(hz=>{const o=ctx.createOscillator();o.type='sine';o.frequency.value=hz;o.connect(tension);o.start()});
    const sway=ctx.createOscillator(), depth=ctx.createGain();sway.frequency.value=.09;depth.gain.value=180;
    sway.connect(depth);depth.connect(air.frequency);sway.start();
    return {ctx,master,filter,gain,layers};
  }
  function cue(kind='tick',force=false){
    if(!sound||!audioGraph||document.hidden||currentScene>=7) return;
    const {ctx,master}=audioGraph, now=ctx.currentTime;
    if(!force&&now-lastCue<.16)return;lastCue=now;
    const o=ctx.createOscillator(), g=ctx.createGain();
    const pitches={tick:420,glass:1350,release:660,rail:65};
    o.type='sine';o.frequency.setValueAtTime(pitches[kind]||420,now);
    o.frequency.exponentialRampToValueAtTime(kind==='release'?330:(pitches[kind]||420)*.8,now+.3);
    g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(kind==='glass'?.018:kind==='rail'?.035:.025,now+.015);
    g.gain.exponentialRampToValueAtTime(.0001,now+(kind==='release'?.65:.28));
    o.connect(g);g.connect(master);o.start(now);o.stop(now+.75);o.onended=()=>{o.disconnect();g.disconnect()};
  }
  let beat=0;
  setInterval(()=>{
    if(!sound||document.hidden||!audioGraph||audioGraph.ctx.state!=='running')return;
    beat++;
    if(currentScene===3)cue('rail');
    else if((currentScene===0||currentScene===4)&&beat%7===0)cue('glass');
  },650);
  hours.addEventListener('input',()=>cue('tick'));
  affordability.addEventListener('input',()=>cue('tick'));
  thoughts.forEach(button=>button.addEventListener('click',()=>cue('release')));
  async function enableSound(){
    const request=++soundRequest;
    try{
      if(!audioGraph)audioGraph=makeSoundGraph();
      if(audioGraph)await audioGraph.ctx.resume();
      if(request!==soundRequest)return false;
      drone.volume=audioGraph?1:0;await drone.play();
      if(request!==soundRequest){drone.pause();return false;}
      sound=true;$('#sound').textContent='Sound on';$('#sound').setAttribute('aria-pressed','true');
      $('#audio-status').hidden=true;update();return true;
    }catch(error){
      mute();$('#audio-status').textContent='Tap Sound on to retry audio, or continue silently.';
      $('#audio-status').hidden=false;return false;
    }
  }
  function mute(){
    soundRequest++;sound=false;drone.pause();
    if(audioGraph){audioGraph.master.gain.cancelScheduledValues(audioGraph.ctx.currentTime);audioGraph.master.gain.setValueAtTime(0,audioGraph.ctx.currentTime);audioGraph.ctx.suspend();}
    $('#sound').textContent='Sound off';$('#sound').setAttribute('aria-pressed','false');
  }
  $('#sound').addEventListener('click',()=>sound?mute():enableSound());
  $('#begin-sound').addEventListener('click',async()=>{await enableSound();$('#without-home').scrollIntoView({behavior:motion?'smooth':'auto'})});
  $('#mix-volume').addEventListener('input',()=>{mixVolume=Number($('#mix-volume').value)/100;updateAudio()});
  function updateAudio(){
    const quiet=document.hidden||currentScene>=7||scrollY>=$('#credits').offsetTop-innerHeight/2;
    targetVolume=sound&&!quiet?Number(scenes[currentScene].dataset.sound||0):0;
    if(audioGraph){
      const {ctx,master,gain,filter,layers}=audioGraph, t=ctx.currentTime;
      master.gain.setTargetAtTime(sound&&!quiet?mixVolume:0,t,.22);
      gain.gain.setTargetAtTime(targetVolume*.65,t,.8);
      filter.frequency.setTargetAtTime(currentScene===5?1100:600,t,.8);
      layers.forEach((layer,i)=>layer.gain.setTargetAtTime(sound&&!quiet?mixProfiles[currentScene][i]:0,t,1.1));
    }else drone.volume=targetVolume*mixVolume;
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
  document.addEventListener('visibilitychange',()=>{if(document.hidden){drone.pause();if(audioGraph)audioGraph.ctx.suspend();}else if(sound){if(audioGraph)audioGraph.ctx.resume().catch(mute);drone.play().catch(mute);}updateAudio()});
  addEventListener('pagehide',mute);
  setHousing();setMotion();update();
})();
