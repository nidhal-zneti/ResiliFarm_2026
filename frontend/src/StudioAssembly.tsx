import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Download, Expand, Focus, RotateCcw, Box, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Design } from "./types";
import { assemblyStl, buildAssembly, disposeAssembly, type AssemblyModel } from "./assemblyGeometry";

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

type View = 'isometric' | 'top' | 'front' | 'focus';
function Scene({ model, selected, onSelect, exploded, labels, routes, view }: {
  model: AssemblyModel; selected: string; onSelect: (key: string) => void;
  exploded: number; labels: boolean; routes: boolean; view: { kind: View; revision: number };
}) {
  const { t } = useTranslation();
  const { camera, size, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useLayoutEffect(() => {
    const focus = view.kind === 'focus' ? model.anchors.get(selected) : undefined;
    const target = new THREE.Vector3(...(focus ?? [0,.8,0]) as [number,number,number]);
    const narrow = Math.max(1, 1.25 / (size.width / size.height));
    const direction = view.kind === 'top' ? [0,16,.01] : view.kind === 'front' ? [0,3,17] : [10,8,12];
    camera.position.copy(target).add(new THREE.Vector3(...direction).multiplyScalar(focus ? .28 : narrow * .87));
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
    invalidate();
  }, [camera, view, size.width, size.height, invalidate, view.kind === 'focus' ? selected : null]);
  useLayoutEffect(() => {
    model.root.getObjectByName('routes')!.visible = routes && exploded < .1;
    const hardware=model.root.getObjectByName('hardware')!;
    for(const group of hardware.children) group.traverse(object => {
      if(object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        object.material.emissive.set(group.userData.partKey === selected ? '#daa45b' : '#000000');
        object.material.emissiveIntensity = .2;
      }
    });
    invalidate();
  }, [model, selected, routes, exploded, invalidate]);
  const click=(event:ThreeEvent<MouseEvent>)=>{
    if(event.delta>4) return;
    let object:THREE.Object3D|null=event.object;
    while(object && !object.userData.partKey) object=object.parent;
    if(object?.userData.partKey) {event.stopPropagation(); onSelect(object.userData.partKey);}
  };
  const labelKeys = labels ? ['esp32','pump','solar','soil','lora',selected] : [selected];
  return <>
    <color attach="background" args={['#172d3b']} />
    <ambientLight intensity={.9}/>
    <hemisphereLight args={['#dceeff','#52665e',1.8]}/>
    <directionalLight position={[2,9,6]} intensity={3.4} castShadow shadow-mapSize={[1536,1536]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} shadow-normalBias={.035}/>
    <directionalLight position={[-6,4,-3]} intensity={1.4} color="#b0d4ed"/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.34,0]} receiveShadow><planeGeometry args={[200,200]}/><meshStandardMaterial color="#172d3b" roughness={1}/></mesh>
    <gridHelper args={[30,30,'#314955','#253c48']} position={[0,-.33,0]}/>
    <primitive object={model.root} onClick={click} dispose={null}/>
    {[...new Set(labelKeys)].map(key=>{
      const p=model.anchors.get(key);
      return p ? <Html key={key} position={[p[0],p[1]+.18,p[2]]} center zIndexRange={[10,0]} style={{pointerEvents:'none'}}>
        <span className={`assembly-label ${key===selected ? 'active' : ''}`}>{t(key)}</span>
      </Html> : null;
    })}
    <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={2} maxDistance={32} maxPolarAngle={Math.PI/2-.03}/>
  </>;
}

export default function StudioAssembly({ design, selected, onSelect }: {
  design:Design; selected:string; onSelect:(key:string)=>void;
}) {
  const {t}=useTranslation();
  const [exploded,setExploded]=useState(0);
  const [labels,setLabels]=useState(true);
  const [routes,setRoutes]=useState(true);
  const [view,setView]=useState<{kind:View;revision:number}>({kind:'isometric',revision:0});
  const [exportError,setExportError]=useState(false);
  const stage=useRef<HTMLDivElement>(null);
  const [fullScreen,setFullScreen]=useState(false);
  const model=useMemo(()=>buildAssembly(design,exploded),[design,exploded]);
  useEffect(()=>()=>disposeAssembly(model.root),[model]);
  useEffect(()=>{
    const change=()=>setFullScreen(document.fullscreenElement===stage.current);
    document.addEventListener('fullscreenchange',change);
    return ()=>document.removeEventListener('fullscreenchange',change);
  },[]);
  const part=design.bom.find(p=>p.key===selected);
  function camera(kind:View) {setView(v=>({kind,revision:v.revision+1}));}
  function download(partKey?:string) {
    try {
      setExportError(false);
      const url=URL.createObjectURL(new Blob([assemblyStl(design,partKey)],{type:'model/stl'}));
      const a=document.createElement('a'); a.href=url; a.download=`resilifarm-${design.options.profile??'design'}-${partKey??'assembly'}.stl`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch {setExportError(true);}
  }
  const fallback=<p className="assembly-fallback" role="status">{t('assemblyWebglFallback')}</p>;
  return <div className="mechanical-view">
    <div ref={stage} className="assembly-stage">
      <div className="assembly-stage-header">
        <div><span className="assembly-kicker">{t('assemblyConcept')}</span><strong>{t('assemblySystemTitle')}</strong></div>
        {document.fullscreenEnabled && <button className="assembly-tool" aria-label={t(fullScreen?'assemblyExitFullscreen':'assemblyFullscreen')} onClick={()=>{
          if(fullScreen) void document.exitFullscreen(); else void stage.current?.requestFullscreen().catch(()=>{});
        }}><Expand size={17}/></button>}
      </div>
      <div className="assembly-camera-bar" role="group" aria-label={t('assemblyCamera')}>
        {(['isometric','top','front'] as const).map(kind=><button key={kind} className="assembly-tool" aria-pressed={view.kind===kind} onClick={()=>camera(kind)}>{t(`assemblyCamera_${kind}`)}</button>)}
        <button className="assembly-tool" onClick={()=>camera('isometric')} aria-label={t('assemblyReset')}><RotateCcw size={15}/></button>
        <button className="assembly-tool" aria-pressed={labels} onClick={()=>setLabels(!labels)} aria-label={t('assemblyLabels')}>{labels?<Eye size={15}/>:<EyeOff size={15}/>}</button>
      </div>
      <div className="assembly-preview assembly-detailed" role="region" aria-label={t('assemblyPreview')}>
        <SceneBoundary fallback={fallback}>
          <Canvas shadows frameloop="demand" dpr={[1,1.5]} camera={{position:[10,8,12],fov:38,near:.1,far:100}} gl={{antialias:true}} fallback={fallback}>
            <Scene model={model} selected={selected} onSelect={onSelect} exploded={exploded} labels={labels} routes={routes} view={view}/>
          </Canvas>
        </SceneBoundary>
      </div>
      <div className="assembly-stage-footer"><span>{t('assemblyOrbitHelp')}</span><span><i/> {t('assemblyConcept')}</span></div>
    </div>
    <div className="assembly-inspector">
      <div><span className="eyebrow">{t('assemblyInspect')}</span><strong>{part ? t(part.key) : t('assemblySystemTitle')}</strong>
        {part && <p>×{part.quantity} · {part.voltage_v} V · {part.protocol}</p>}
      </div>
      <button disabled={!part} onClick={()=>camera('focus')}><Focus size={16}/>{t('assemblyFocus')}</button>
    </div>
    <div className="assembly-toolbar">
      <label>{t('explodedView')} · {Math.round(exploded*100)}%<input type="range" min="0" max="1" step=".05" value={exploded} onChange={e=>setExploded(Number(e.target.value))}/></label>
      <label className="check"><input type="checkbox" checked={routes} onChange={e=>setRoutes(e.target.checked)}/>{t('assemblyRouting')}</label>
    </div>
    <p className="blueprint-caveat">{t(exploded>.1?'assemblyExplodedNote':'assemblyRepresentation')}</p>
    <div className="assembly-export">
      <button onClick={()=>download()}><Download size={15}/>{t('exportAssemblyStl')}</button>
      <button disabled={!part} onClick={()=>download(selected)}><Download size={15}/>{t('exportSelectedStl')}</button>
    </div>
    {exportError && <p role="alert">{t('assemblyExportError')}</p>}
    <p className="blueprint-caveat">{t('stlNote')}</p>
    <section className="assembly-parts" aria-label={t('assemblyTree')}>
      <h3><Box size={17}/>{t('assemblyTree')}</h3>
      <div>{design.bom.map(p=><button key={p.key} aria-pressed={p.key===selected} onClick={()=>onSelect(p.key)}>{t(p.key)} <span>×{p.quantity}</span></button>)}</div>
    </section>
  </div>;
}
