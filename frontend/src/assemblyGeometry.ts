import * as THREE from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import type { Design } from "./types";

type Point = [number, number, number];
const C = { metal: "#b7c4ce", dark: "#243442", pcb: "#157466", gold: "#dcb96e", water: "#358bb2", power: "#df9154", signal: "#74a790" };

function material(color: string, metalness = 0.1, opacity = 1) {
  return new THREE.MeshStandardMaterial({ color, roughness: metalness > .4 ? .32 : .65, metalness, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
}
function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, color: string, p: Point, metalness = .1, opacity = 1) {
  const m = new THREE.Mesh(geometry, material(color, metalness, opacity));
  m.position.set(...p); m.castShadow = opacity === 1; m.receiveShadow = true; parent.add(m); return m;
}
function box(g: THREE.Group, p: Point, size: Point, color: string, metalness = .1, opacity = 1) {
  return mesh(g, new THREE.BoxGeometry(...size), color, p, metalness, opacity);
}
function cylinder(g: THREE.Group, a: Point, b: Point, radius: number, color: string, metalness = .4, topRadius = radius) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const m = mesh(g, new THREE.CylinderGeometry(topRadius, radius, delta.length(), 20), color, start.clone().add(end).multiplyScalar(.5).toArray() as Point, metalness);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m;
}
function tube(g: THREE.Group, points: Point[], color: string, radius = .022) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  return mesh(g, new THREE.TubeGeometry(curve, 28, radius, 8, false), color, [0, 0, 0], .15);
}
function screw(g: THREE.Group, x: number, y: number, z: number) {
  cylinder(g, [x,y,z], [x,y,z+.025], .035, C.metal, .8);
  box(g, [x,y,z+.027], [.042,.009,.006], C.dark);
}
function terminals(g: THREE.Group, x: number, y: number, z: number, count: number) {
  for (let i=0;i<count;i++) {
    box(g,[x+i*.105,y,z],[.095,.14,.12],"#55a582");
    screw(g,x+i*.105,y,z+.065);
  }
}
function board(g: THREE.Group, width = .64, height = .82) {
  box(g,[0,0,0],[width,height,.04],C.pcb);
  for (const x of [-width/2+.055,width/2-.055]) {
    for (const y of [-height/2+.055,height/2-.055]) screw(g,x,y,.03);
  }
  for (let i=0;i<4;i++) box(g,[-width*.22+i*width*.14,-height*.22,.028],[.018,height*.32,.008],"#b6ba6c",.55);
}
function smallBoard(g: THREE.Group, key: string) {
  board(g,.54,.4);
  if (key === 'relay') {
    box(g,[0,.035,.12],[.32,.25,.2],"#327bba");
    terminals(g,-.18,-.15,.09,4);
  } else if (key === 'regulator' || key === 'charger') {
    cylinder(g,[-.1,.01,.04],[-.1,.01,.2],.09,"#665942",.7);
    for(let i=0;i<5;i++) box(g,[.06+i*.03,.04,.1],[.016,.18,.14],C.dark,.7);
    terminals(g,-.16,-.16,.06,4);
  } else if (key === 'protection') {
    box(g,[0,0,.09],[.37,.26,.12],"#f2efe5");
    for(let i=0;i<2;i++) box(g,[-.09+i*.18,.015,.17],[.1,.12,.06],"#c86847");
  } else {
    box(g,[0,0,.06],[.22,.18,.08],C.dark);
    terminals(g,-.16,-.15,.07,4);
  }
}
function controller(g: THREE.Group) {
  board(g,.67,1.08);
  box(g,[0,.15,.09],[.43,.48,.13],C.metal,.75);
  box(g,[0,-.25,.08],[.22,.17,.1],C.dark);
  box(g,[0,-.49,.06],[.19,.12,.14],C.metal,.8);
  box(g,[0,-.51,.14],[.12,.045,.015],"#121f29");
  for(const side of [-1,1]) for(let i=0;i<12;i++) {
    box(g,[side*.31,-.39+i*.072,.07],[.06,.052,.09],"#17242a");
    cylinder(g,[side*.31,-.39+i*.072,.1],[side*.31,-.39+i*.072,.17],.012,C.gold,.8);
  }
  for(let i=0;i<5;i++) box(g,[-.17+i*.07,.45,.035],[.035,.1,.012],C.gold,.7);
  mesh(g,new THREE.SphereGeometry(.023,8,6),"#91efa6",[.17,-.28,.15]);
}
function pump(g: THREE.Group) {
  box(g,[0,.08,0],[1.1,.13,.6],C.dark,.5);
  cylinder(g,[-.35,.38,0],[.33,.38,0],.25,"#4c7b99",.55);
  for(let i=0;i<8;i++) cylinder(g,[-.33+i*.08,.38,0],[-.30+i*.08,.38,0],.275,"#37586d",.7);
  cylinder(g,[.3,.38,0],[.57,.38,0],.3,C.metal,.75);
  cylinder(g,[.5,.38,.22],[.5,.38,.48],.1,C.dark);
  cylinder(g,[.48,.56,0],[.48,.84,0],.095,C.dark);
  box(g,[-.04,.65,0],[.31,.12,.25],C.dark);
  for(const x of [-.42,.42]) for(const z of [-.22,.22]) cylinder(g,[x,.13,z],[x,.17,z],.035,C.metal,.8);
}
function probe(g: THREE.Group, key: string) {
  if(key === 'soil') {
    box(g,[0,.4,0],[.16,.46,.045],"#23483b");
    for(const x of [-.046,.046]) box(g,[x,.32,.028],[.025,.32,.009],C.gold,.65);
    box(g,[0,.68,0],[.24,.17,.11],C.pcb);
    box(g,[0,.7,.067],[.12,.075,.045],C.dark);
    tube(g,[[0,.77,0],[.08,.9,0],[.23,.86,.08]],C.signal,.016);
  } else if(key === 'pressure') {
    cylinder(g,[0,.04,0],[0,.35,0],.065,C.metal,.8);
    cylinder(g,[0,.35,0],[0,.65,0],.13,C.metal,.8);
    cylinder(g,[0,.65,0],[0,.8,0],.085,C.dark);
  } else if(key === 'flow') {
    cylinder(g,[-.3,.19,0],[.3,.19,0],.11,C.dark);
    cylinder(g,[0,.2,0],[0,.42,0],.2,"#3788a0");
    cylinder(g,[0,.42,0],[0,.45,0],.16,C.dark);
  } else if(key === 'ph' || key === 'ec') {
    cylinder(g,[0,.02,0],[0,.48,0],.045,C.metal,.8);
    cylinder(g,[0,.48,0],[0,.75,0],.09,key==='ph' ? '#4c7698' : '#677481');
  } else {
    box(g,[0,.35,0],[.38,.5,.22],key==='co2' ? C.metal : '#e5edf0');
    for(let i=0;i<5;i++) box(g,[0,.2+i*.07,.116],[.28,.022,.012],C.dark);
    if(key==='light') cylinder(g,[0,.6,0],[0,.65,0],.15,"#b7d1c6");
    cylinder(g,[0,0,0],[0,.1,0],.04,C.metal);
  }
}
function solarPanel(g: THREE.Group) {
  for(const x of [-.75,.75]) {
    cylinder(g,[x,0,.25],[x,1.14,-.18],.045,C.metal,.8);
    cylinder(g,[x,0,-.65],[x,1.14,-.18],.045,C.metal,.8);
  }
  const panel=new THREE.Group(); panel.position.set(0,1.15,0); panel.rotation.x=-.55; g.add(panel);
  box(panel,[0,0,0],[2,.085,1.32],C.metal,.75);
  box(panel,[0,.05,0],[1.91,.02,1.23],"#152f49",.35);
  for(let x=0;x<6;x++) for(let z=0;z<4;z++) {
    box(panel,[-.79+x*.315,.065,-.455+z*.303],[.3,.012,.286],(x+z)%2 ? '#244565' : '#1c3a59',.5);
    for(const dx of [-.06,.06]) box(panel,[-.79+x*.315+dx,.074,-.455+z*.303],[.006,.003,.28],"#849aaa",.7);
  }
}
function battery(g: THREE.Group) {
  box(g,[0,.33,0],[.65,.62,.45],"#2d3d49");
  box(g,[0,.65,0],[.67,.06,.47],"#172a35");
  box(g,[0,.34,.23],[.43,.3,.012],"#d9e1da");
  for(const sign of [-1,1]) {
    cylinder(g,[sign*.22,.69,0],[sign*.22,.77,0],.05,sign<0 ? '#c55f45' : C.dark);
    box(g,[sign*.22,.78,0],[.12,.035,.035],C.metal,.8);
  }
  box(g,[0,.38,.24],[.25,.035,.012],"#426a58");
}
function valve(g: THREE.Group) {
  cylinder(g,[-.25,.18,0],[.25,.18,0],.085,C.metal,.8);
  cylinder(g,[0,.18,0],[0,.37,0],.12,"#bd9b55",.7);
  box(g,[0,.46,0],[.22,.22,.25],"#334a59");
  cylinder(g,[0,.56,0],[0,.65,0],.04,C.metal,.8);
  box(g,[0,.67,0],[.28,.035,.08],"#54929a");
}
function fan(g: THREE.Group) {
  box(g,[0,.46,0],[.85,.85,.17],"#a9b6b7",.5);
  cylinder(g,[0,.46,.09],[0,.46,.13],.36,C.dark);
  for(let i=0;i<5;i++) {
    const blade=box(g,[0,.46,.16],[.12,.58,.025],"#7d9a9c",.65); blade.rotation.z=i*Math.PI/5;
  }
  cylinder(g,[0,.46,.17],[0,.46,.21],.09,C.metal,.8);
}
function device(g: THREE.Group, key: string) {
  if(key==='esp32') return controller(g);
  if(key==='pump') return pump(g);
  if(key==='solar') return solarPanel(g);
  if(key==='battery') return battery(g);
  if(key==='valve') return valve(g);
  if(key==='fan') return fan(g);
  if(['soil','pressure','flow','temperature','humidity','light','co2','ph','ec'].includes(key)) return probe(g,key);
  if(key==='lora') {
    smallBoard(g,key); cylinder(g,[.15,.1,.07],[.15,.85,.07],.025,C.dark);
    cylinder(g,[.15,.08,.07],[.15,.23,.07],.045,C.gold,.7); return;
  }
  if(key==='vent' || key==='shade') {
    box(g,[0,.5,0],[1,.72,.06],C.metal,.8);
    for(let i=0;i<6;i++) {
      const slat=box(g,[0,.22+i*.11,.09],[.9,.1,.025],key==='vent' ? '#718e91' : '#729076'); slat.rotation.x=.5;
    } return;
  }
  if(key==='misting') {
    cylinder(g,[-.35,.5,0],[.35,.5,0],.04,C.water);
    for(const x of [-.25,0,.25]) cylinder(g,[x,.4,0],[x,.5,0],.035,C.gold); return;
  }
  if(key==='cooler') {
    box(g,[0,.45,0],[.8,.9,.55],"#ced8d8",.4);
    for(let i=0;i<7;i++) box(g,[0,.2+i*.075,.29],[.6,.035,.02],C.dark); return;
  }
  smallBoard(g,key);
}

export type AssemblyModel = { root: THREE.Group; anchors: Map<string, Point>; shown: Map<string, number> };

/** Conceptual display coordinates, not millimetres or farm-scale dimensions. */
export function buildAssembly(design: Design, exploded = 0): AssemblyModel {
  const root = new THREE.Group(); root.name='resilifarm_concept';
  const context = new THREE.Group(); context.name='context'; root.add(context);
  const hardware = new THREE.Group(); hardware.name='hardware'; root.add(hardware);
  const routes = new THREE.Group(); routes.name='routes'; root.add(routes);
  box(context,[0,-.16,0],[8.8,.23,5.8],"#cad7d4");
  box(context,[0,-.29,0],[8.95,.05,5.95],"#829a99",.4);
  // Open cabinet with mounting backplate, cable glands and a lifted clear cover.
  const cabinet=new THREE.Group(); cabinet.position.set(-2.9,0,0); context.add(cabinet);
  box(cabinet,[0,1.28,-.36],[2.2,2.5,.1],"#d8e3e0");
  box(cabinet,[0,1.25,-.285],[2,2.28,.035],"#aebfbd",.65);
  for(const x of [-1.13,1.13]) box(cabinet,[x,1.28,.05],[.09,2.5,.9],"#e9efea",.25);
  for(const y of [.04,2.52]) box(cabinet,[0,y,.05],[2.35,.09,.9],"#e9efea",.25);
  for(const y of [.55,1.15,1.9]) box(cabinet,[0,y,-.24],[2,.045,.04],C.metal,.8);
  const door=new THREE.Group(); door.position.set(exploded*.3,exploded*.65,.56+exploded*1.1); cabinet.add(door);
  box(door,[0,1.28,0],[2.18,2.38,.025],"#b6d2d6",.1,.08);
  for(const x of [-1.1,1.1]) box(door,[x,1.28,0],[.045,2.42,.045],C.metal,.8);
  for(const y of [.07,2.49]) box(door,[0,y,0],[2.2,.045,.045],C.metal,.8);
  box(door,[.94,1.3,.04],[.06,.28,.06],C.dark,.6);
  for(const x of [-.7,0,.7]) cylinder(cabinet,[x,-.01,.12],[x,-.01,.3],.075,C.dark);
  const anchors = new Map<string,Point>(), shown = new Map<string,number>();
  let boardIndex=0, sensorIndex=0, accessoryIndex=0;
  const has=(key:string)=>design.bom.some(p=>p.key===key);
  for(const part of design.bom) {
    const count = ['soil','relay','valve'].includes(part.key) ? Math.min(part.quantity,6) : 1;
    shown.set(part.key,count);
    for(let i=0;i<count;i++) {
      let p:Point;
      if(part.key==='esp32') p=[-3.48,1.72,.0];
      else if(part.key==='lora') p=[-2.4,1.7,.0];
      else if(part.key==='solar') p=[.0,0,-1.75];
      else if(part.key==='battery') p=[-1.2,0,-1.65];
      else if(part.key==='pump') p=[-.6,0,1.55];
      else if(part.key==='soil') p=[1.35+(i%3)*.93,.02,.25+Math.floor(i/3)*1.45];
      else if(part.key==='valve') p=[.5+i*.5,.03,2.35];
      else if(part.key==='flow') p=[.45,.1,1.15];
      else if(part.key==='pressure') p=[.85,.06,.78];
      else if(['temperature','humidity','light','co2','ph','ec'].includes(part.key)) {
        p=[1.25+(sensorIndex%4)*.67,0,-1.8+Math.floor(sensorIndex/4)*.7]; sensorIndex++;
      } else if(['fan','cooler','shade','vent','misting'].includes(part.key)) {
        p=[1.3+(accessoryIndex%3)*.95,1.05+Math.floor(accessoryIndex/3),-2]; accessoryIndex++;
      } else {
        p=[-3.63+(boardIndex%3)*.68,1-Math.floor(boardIndex/3)*.27,.0]; boardIndex++;
      }
      const g=new THREE.Group(); g.name=`${part.key}-${i+1}`; g.userData.partKey=part.key;
      g.position.set(p[0],p[1]+exploded*(part.key==='soil' ? .4 : .12),p[2]+(p[0]<-1.7 ? exploded*.7 : 0));
      device(g,part.key); hardware.add(g);
      if(p[0]<-1.7 && part.key!=='esp32' && part.key!=='lora') g.scale.setScalar(.65);
      if(!anchors.has(part.key)) anchors.set(part.key,[g.position.x,g.position.y+(p[0]<-1.7 ? .15 : .8),g.position.z]);
    }
  }
  if(has('soil')) {
    for(let row=0;row<2;row++) {
      box(context,[2.28,-.015,.25+row*1.45],[2.85,.12,.95],"#826b50");
      for(let col=0;col<8;col++) {
        const x=1.1+col*.34, z=.04+row*1.45;
        cylinder(context,[x,.02,z],[x,.19,z],.015,"#5d8258");
        for(const side of [-1,1]) {
          const leaf=mesh(context,new THREE.SphereGeometry(.075,7,5),"#6e9764",[x+side*.04,.14,z]); leaf.scale.set(1,.35,.6); leaf.rotation.z=side*.45;
        }
      }
    }
  }
  if(design.options.tank) {
    cylinder(context,[-.7,.03,-.4],[-.7,1.05,-.4],.42,"#9fbdbb",.15);
    cylinder(context,[-.7,1.05,-.4],[-.7,1.11,-.4],.25,C.dark);
  }
  if(has('pump') && has('soil')) {
    tube(routes,[[-.12,.82,1.55],[.1,.83,1.55],[.15,.16,1.55],[.65,.14,1.55],[.65,.14,2.35],[3.55,.14,2.35]],C.water,.055);
    for(let i=0;i<3;i++) tube(routes,[[1.35+i*.93,.14,2.35],[1.35+i*.93,.14,1.95],[1.35+i*.93,.09,.05]],C.water,.025);
  }
  // One representative cable per catalogue pair; not an electrically reviewed harness.
  const pairs=new Set<string>();
  for(const wire of design.connections) {
    const source=wire.source.split(':')[0], target=wire.target.split(':')[0];
    const a=anchors.get(source), b=anchors.get(target), id=[source,target].sort().join(':');
    if(!a || !b || pairs.has(id)) continue;
    pairs.add(id);
    const power=/\bDC\b|\bVIN\b|\b12 V\b|\b18 V\b/.test(wire.signal);
    tube(routes,[a,[a[0],Math.max(.15,a[1]-.2),a[2]+.25],[(a[0]+b[0])/2,Math.max(.15,Math.min(a[1],b[1])-.2),Math.max(a[2],b[2])+.3],[b[0],b[1],b[2]+.1],b],power ? C.power : C.signal,.014);
  }
  root.updateMatrixWorld(true);
  return {root,anchors,shown};
}

export function disposeAssembly(root: THREE.Object3D) {
  root.traverse(object => {
    if(object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(m=>m.dispose());
    }
  });
}

export function assemblyStl(design: Design, partKey?: string): string {
  const {root}=buildAssembly(design);
  const context=root.getObjectByName('context')!, routes=root.getObjectByName('routes')!;
  root.remove(context,routes);
  const hardware=root.getObjectByName('hardware')!;
  const excluded:THREE.Object3D[]=[];
  if(partKey) for(const child of [...hardware.children]) if(child.userData.partKey!==partKey) {hardware.remove(child); excluded.push(child);}
  root.updateMatrixWorld(true);
  const stl = new STLExporter().parse(root);
  disposeAssembly(root); disposeAssembly(context); disposeAssembly(routes); excluded.forEach(disposeAssembly);
  return stl;
}
