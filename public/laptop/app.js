import {foldAmount,smoothAngle} from './hinge.js';
import {LaptopRenderer} from './renderer.js';
const $=id=>document.getElementById(id), angle=$('angle'),strength=$('strength'),status=$('status');
let neutral=110,current=110,renderer,frame=0,last=0,dirty=true,photo;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function schedule(){if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
function draw(time){frame=0;const target=Number(angle.value);current=reduced.matches?target:smoothAngle(current,target,last?time-last:16);last=time;
 if(dirty||Math.abs(current-target)>.01){renderer?.draw(foldAmount(current,neutral,Number(strength.value)/100));dirty=false;schedule();}
}
function update(){ $('angle-output').textContent=$('angle-label').textContent=`${angle.value}°`;$('strength-output').textContent=`${strength.value}%`;dirty=true;schedule(); }
angle.addEventListener('input',update);strength.addEventListener('input',update);
$('calibrate').onclick=()=>{neutral=Math.max(20,Math.min(160,Number(angle.value)));status.textContent=`Manual preview · neutral at ${neutral}°. Your photo stays on this device.`;update();};
$('reset').onclick=()=>{neutral=110;angle.value=110;strength.value=100;status.textContent='Manual preview · neutral at 110°. Your photo stays on this device.';update();};
let loadId=0;
async function load(src,local=false){const id=++loadId;try{const image=new Image();image.src=src;await image.decode();if(id!==loadId)return;renderer.setImage(image);photo=image;dirty=true;schedule();if(local)status.textContent=`Photo loaded locally · neutral at ${neutral}°.`;}catch(e){status.textContent=e.message;}finally{if(local)URL.revokeObjectURL(src);}}
$('file').onchange=()=>{const file=$('file').files[0];if(file){if(file.size>40*1024*1024){status.textContent='Choose a photo smaller than 40 MB.';return;}load(URL.createObjectURL(file),true);}};
$('screen').addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);frame=0;status.textContent='Graphics paused. Waiting for the GPU to recover.';});
$('screen').addEventListener('webglcontextrestored',()=>{try{renderer=new LaptopRenderer($('screen'));if(photo)renderer.setImage(photo);update();status.textContent='Graphics restored.';}catch(e){status.textContent=e.message;}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{last=0;dirty=true;schedule();}});
new ResizeObserver(()=>{dirty=true;schedule();}).observe($('screen'));
try{renderer=new LaptopRenderer($('screen'));load('/laptop/wallpaper.svg');}catch(e){status.textContent=e.message;}
