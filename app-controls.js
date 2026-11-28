(() => {
  'use strict';
  const DB_NAME='retalhos-db', DB_VERSION=2, STORE='memories', COVER_KEY='retalhos-cover-view';
  const DEFAULT_CENTER=[39.6,-8], DEFAULT_ZOOM=6.4, TOTAL_MUNICIPALITIES=308, TOTAL_DISTRICTS=18;
  const $=id=>document.getElementById(id);
  const photoInput=$('photoInput'), cameraInput=$('cameraInput'), backupInput=$('backupInput'), mapElement=$('map');
  const objectUrls=new Map();
  let map, markerLayer, allMemories=[], municipalities=[], selectedPlace=null, selectedYear='all', reverseQueueRunning=false;

  const PT_DISTRICTS = {
    'abrantes':'Santarem','aguiar da beira':'Guarda','alandroal':'Evora','albergaria-a-velha':'Aveiro','albufeira':'Faro',
    'alcacer do sal':'Setubal','alcanena':'Santarem','alcobaca':'Leiria','alcochete':'Setubal','alcoutim':'Faro',
    'alijo':'Vila Real','aljezur':'Faro','aljustrel':'Beja','almada':'Setubal','almeida':'Guarda',
    'almeirim':'Santarem','almodovar':'Beja','alpiarca':'Santarem','alter do chao':'Portalegre','alvaiazer':'Leiria',
    'alvaiazere':'Leiria','amadora':'Lisboa','amarante':'Porto','amares':'Braga','anadia':'Aveiro','angra do heroismo':'Acores',
    'ansiao':'Leiria','arcos de valdevez':'Viana do Castelo','arganil':'Coimbra',
    'armamar':'Viseu','arouca':'Aveiro','arraiolos':'Evora','arronches':'Portalegre','arruda dos vinhos':'Lisboa',
    'aveiro':'Aveiro','aviso':'Portalegre','azambuja':'Lisboa','baiao':'Porto','barcelos':'Braga','barrancos':'Beja',
    'barreiro':'Setubal','batalha':'Leiria','beja':'Beja','belmonte':'Castelo Branco','benavente':'Santarem',
    'bombarral':'Leiria','borba':'Evora','boticas':'Vila Real','braga':'Braga','braganca':'Braganca',
    'cabeco de vide':'Portalegre','cadaval':'Lisboa','caldas da rainha':'Leiria','calheta':'Madeira','camara de lobos':'Madeira',
    'caminha':'Viana do Castelo','campo maior':'Portalegre','cantanhede':'Coimbra','carrazeda de ansiaes':'Braganca',
    'carregal do sal':'Viseu','cartaxo':'Santarem','cascais':'Lisboa','castanheira de pera':'Leiria','castelo branco':'Castelo Branco',
    'castelo de paiva':'Aveiro','castelo de vide':'Portalegre','castro daire':'Viseu','castro marim':'Faro','castro verde':'Beja',
    'celorico da beira':'Guarda','celorico de basto':'Braga','chamusca':'Santarem','chaves':'Vila Real','cinfaes':'Viseu',
    'coimbra':'Coimbra','condeixa-a-nova':'Coimbra','constancia':'Santarem','coruche':'Santarem','covilha':'Castelo Branco',
    'crato':'Portalegre','cuba':'Beja','elvas':'Portalegre','entroncamento':'Santarem','espinho':'Aveiro','esposende':'Braga',
    'estarreja':'Aveiro','estremoz':'Evora','evora':'Evora','fafe':'Braga','faro':'Faro','ferreira do alentejo':'Beja',
    'ferreira do zezere':'Santarem','figueira da foz':'Coimbra','figueira de castelo rodrigo':'Guarda','figueiro dos vinhos':'Leiria',
    'fornos de algodres':'Guarda','freixo de espada a cinta':'Braganca','fronteira':'Portalegre','funchal':'Madeira','fundao':'Castelo Branco',
    'gaviao':'Portalegre','goes':'Coimbra','golega':'Santarem','gouveia':'Guarda','grandola':'Setubal','guarda':'Guarda',
    'idanha-a-nova':'Castelo Branco','ilhavo':'Aveiro','lagoa':'Faro','lagos':'Faro','lajes das flores':'Acores','lajes do pico':'Acores',
    'lamego':'Viseu','leiria':'Leiria','lisboa':'Lisboa','loule':'Faro','loures':'Lisboa','lourinha':'Lisboa','lousa':'Coimbra',
    'macao':'Santarem','macedo de cavaleiros':'Braganca','machico':'Madeira','mafra':'Lisboa','maia':'Porto',
    'manteigas':'Guarda','marco de canaveses':'Porto','marinha grande':'Leiria','marvao':'Portalegre','matosinhos':'Porto',
    'mealhada':'Aveiro','meda':'Guarda','melgaco':'Viana do Castelo','mertola':'Beja','mesao frio':'Viseu','mira':'Coimbra',
    'miranda do corvo':'Coimbra','miranda do douro':'Braganca','mirandela':'Braganca','mogadouro':'Braganca','moimenta da beira':'Viseu',
    'moita':'Setubal','moncao':'Viana do Castelo','monchique':'Faro','mondim de basto':'Vila Real','monforte':'Portalegre',
    'montalegre':'Vila Real','montemor-o-novo':'Evora','montemor-o-velho':'Coimbra','montijo':'Setubal','mora':'Evora','mortagua':'Viseu',
    'moura':'Beja','mourao':'Evora','murca':'Vila Real','nazare':'Leiria','nelas':'Viseu','nisa':'Portalegre','nordeste':'Acores',
    'obidos':'Leiria','odemira':'Beja','odivelas':'Lisboa','oeiras':'Lisboa','oleiros':'Castelo Branco','olhao':'Faro',
    'oliveira de azemeis':'Aveiro','oliveira de frades':'Viseu','oliveira do bairro':'Aveiro','oliveira do hospital':'Coimbra',
    'ourem':'Santarem','ourique':'Beja','ovar':'Aveiro','pacos de ferreira':'Porto','palmela':'Setubal',
    'pampilhosa da serra':'Coimbra','paredes':'Porto','paredes de coura':'Viana do Castelo','pedrogao grande':'Leiria',
    'penacova':'Coimbra','penafiel':'Porto','penalva do castelo':'Viseu','penamacor':'Castelo Branco','penedono':'Viseu',
    'peniche':'Leiria','peso da regua':'Vila Real','pinhel':'Guarda','pombal':'Leiria','ponta delgada':'Acores','ponta do sol':'Madeira',
    'ponte da barca':'Viana do Castelo','ponte de lima':'Viana do Castelo','ponte de sor':'Portalegre','portalegre':'Portalegre',
    'portel':'Evora','portimao':'Faro','porto':'Porto','porto de mos':'Leiria','porto moniz':'Madeira','porto santo':'Madeira',
    'povoa de lanhoso':'Braga','povoa de varzim':'Porto','praia da vitoria':'Acores','proenca-a-nova':'Castelo Branco',
    'redondo':'Evora','reguengos de monsaraz':'Evora','resende':'Viseu','ribeira brava':'Madeira','ribeira de pena':'Vila Real',
    'ribeira grande':'Acores','rio maior':'Santarem','sabrosa':'Vila Real','sabugal':'Guarda','salvaterra de magos':'Santarem',
    'santa comba dao':'Viseu','santa cruz':'Madeira','santa cruz da graciosa':'Acores','santa cruz das flores':'Acores',
    'santa maria da feira':'Aveiro','santa marta de penaguao':'Vila Real','santana':'Madeira','santarem':'Santarem',
    'santiago do cacem':'Setubal','santo tirso':'Porto','sao bras de alportel':'Faro','sao joao da madeira':'Aveiro',
    'sao joao da pesqueira':'Viseu','sao pedro do sul':'Viseu','sao roque do pico':'Acores','sao vicente':'Madeira',
    'sardoal':'Santarem','satao':'Viseu','seia':'Guarda','seixal':'Setubal','sernancelhe':'Viseu','serpa':'Beja',
    'serta':'Castelo Branco','sesimbra':'Setubal','setubal':'Setubal','sever do vouga':'Aveiro','silves':'Faro','sines':'Setubal',
    'sintra':'Lisboa','sobral de monte agraco':'Lisboa','soure':'Coimbra','sousel':'Portalegre','tabua':'Coimbra','tabuaco':'Viseu',
    'tarouca':'Viseu','tavira':'Faro','terras de bouro':'Braga','tomar':'Santarem','tondela':'Viseu','torre de moncorvo':'Braganca',
    'torres novas':'Santarem','torres vedras':'Lisboa','trancoso':'Guarda','trofa':'Porto','vagos':'Aveiro',
    'vale de cambra':'Aveiro','valenca':'Viana do Castelo','valongo':'Porto','valpacos':'Vila Real','velas':'Acores',
    'vendas novas':'Evora','viana do alentejo':'Evora','viana do castelo':'Viana do Castelo','vidigueira':'Beja','vieira do minho':'Braga',
    'vila de rei':'Castelo Branco','vila do bispo':'Faro','vila do conde':'Porto','vila do porto':'Acores','vila flor':'Braganca',
    'vila franca de xira':'Lisboa','vila nova da barquinha':'Santarem','vila nova de cerveira':'Viana do Castelo',
    'vila nova de famalicao':'Braga','vila nova de foz coa':'Guarda','vila nova de gaia':'Porto','vila nova de paiva':'Viseu',
    'vila nova de poiares':'Coimbra','vila pouca de aguiar':'Vila Real','vila real':'Vila Real','vila real de santo antonio':'Faro',
    'vila velha de rodao':'Castelo Branco','vila verde':'Braga','vila vicosa':'Evora','vimioso':'Braganca','vinhais':'Braganca',
    'viseu':'Viseu','vizela':'Braga','vouzela':'Viseu'
  };

  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt').replace(/\s+/g,' ');
  const propVal=(props,names)=>{
    if(!props)return'';
    for(const n of names)if(props[n]!=null&&String(props[n]).trim())return String(props[n]).trim();
    const keys=Object.keys(props);
    for(const n of names){
      const k=keys.find(x=>norm(x)===norm(n));
      if(k&&String(props[k]).trim())return String(props[k]).trim();
    }
    return'';
  };
  const municipalityName=f=>propVal(f?.properties,['municipio','MUNICIPIO','concelho','CONCELHO','nome_concelho','NOME_CONCELHO','name','NAME','nome','NOME']);
  const districtName=f=>{
    const d=propVal(f?.properties,['distrito','DISTRITO','nome_distrito','NOME_DISTRITO','district','District','district_name','ilha','ILHA']);
    if(d)return d;
    const m=norm(municipalityName(f));
    return PT_DISTRICTS[m]||'';
  };

  function getItemYear(item){
    const ts=item?.takenAt||item?.created;
    if(!ts)return null;
    const y=new Date(ts).getFullYear();
    return Number.isFinite(y)?String(y):null;
  }

  function getFilteredMemories(){
    if(selectedYear==='all')return allMemories;
    return allMemories.filter(item=>getItemYear(item)===selectedYear);
  }

  function renderYearFilters(){
    const years=[...new Set(allMemories.map(getItemYear).filter(Boolean))].sort().reverse();
    if(selectedYear!=='all'&&!years.includes(selectedYear))selectedYear='all';
    const pillsBox=$('yearPills');
    if(pillsBox){
      pillsBox.replaceChildren();
      const makeBtn=(value,label)=>{
        const b=document.createElement('button');
        b.type='button';
        b.className=`year-pill${selectedYear===value?' active':''}`;
        b.dataset.year=value;
        b.textContent=label;
        b.onclick=()=>{selectedYear=value;renderYearFilters();applyYearView();};
        return b;
      };
      pillsBox.appendChild(makeBtn('all','Todos os anos'));
      years.forEach(y=>pillsBox.appendChild(makeBtn(y,y)));
    }
    if($('activeYearLabel'))$('activeYearLabel').textContent=selectedYear==='all'?'A mostrar: Todos os anos':`A mostrar: Ano ${selectedYear}`;
    const select=$('printYearSelect');
    if(select){
      const prev=select.value;
      select.replaceChildren();
      const optAll=document.createElement('option');
      optAll.value='all';
      optAll.textContent='Todos os anos';
      select.appendChild(optAll);
      years.forEach(y=>{
        const opt=document.createElement('option');
        opt.value=y;
        opt.textContent=y;
        select.appendChild(opt);
      });
      select.value=years.includes(prev)?prev:(selectedYear!=='all'?selectedYear:'all');
    }
  }

  function notify(message){const toast=$('toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.remove('show'),4500);}
  function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB indisponível'));req.onblocked=()=>reject(new Error('A base de dados está bloqueada por outra janela.'));});}
  async function getMemories(){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}
  async function writeMany(items){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);items.forEach(item=>store.put(item));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Falha ao guardar dados'));tx.onabort=()=>reject(tx.error||new Error('A gravação foi interrompida'));});}
  function imageUrl(item){if(!objectUrls.has(item.id))objectUrls.set(item.id,item.blob instanceof Blob?URL.createObjectURL(item.blob):(item.image||''));return objectUrls.get(item.id);}
  function areaFor(lat,lng){if(!window.turf||!municipalities.length||!Number.isFinite(lat)||!Number.isFinite(lng))return null;const p=turf.point([lng,lat]);return municipalities.find(f=>{try{return turf.booleanPointInPolygon(p,f);}catch(_){return false;}})||null;}
  function areaByText(value){const wanted=norm(value);if(!wanted||wanted===norm('Local indicado no mapa'))return null;const parts=String(value).split(/[,;·-]/).map(norm).filter(Boolean);return municipalities.find(f=>{const n=norm(municipalityName(f));return n&&(n===wanted||parts.includes(n)||wanted.includes(n));})||null;}
  function resolveArea(item){return areaFor(item.lat,item.lng)||areaByText(item.locationName)||areaByText(item.suggestedLocation);}

  function placeName(item){
    const explicit=String(item.locationName||item.suggestedLocation||'').trim();
    if(explicit&&explicit!=='Local indicado no mapa')return explicit.split(',')[0].trim();
    return item.municipalityName||municipalityName(resolveArea(item))||item.countryName||'Outros locais';
  }

  function resolveDistrictForItem(item,area){
    if(item.districtName)return item.districtName;
    const dArea=districtName(area);
    if(dArea)return dArea;
    const mArea=norm(municipalityName(area));
    if(mArea&&PT_DISTRICTS[mArea])return PT_DISTRICTS[mArea];
    const mStored=norm(item.municipalityName);
    if(mStored&&PT_DISTRICTS[mStored])return PT_DISTRICTS[mStored];
    const textParts=String(item.locationName||item.suggestedLocation||'').split(/[,;·-]/).map(norm).filter(Boolean);
    for(const part of textParts){
      if(part.includes('acor'))return 'Acores';
      if(part.includes('madeira'))return 'Madeira';
      if(PT_DISTRICTS[part])return PT_DISTRICTS[part];
      const matchKey=Object.keys(PT_DISTRICTS).find(k=>PT_DISTRICTS[k]&&(part===k||part.includes(k)));
      if(matchKey)return PT_DISTRICTS[matchKey];
    }
    return '';
  }

  function resolveMunicipalityForItem(item,area){
    if(item.municipalityName)return item.municipalityName;
    const mArea=municipalityName(area);
    if(mArea)return mArea;
    const textParts=String(item.locationName||item.suggestedLocation||'').split(/[,;·-]/).map(norm).filter(Boolean);
    for(const part of textParts){
      if(PT_DISTRICTS[part]!==undefined){
        return part.replace(/\b\w/g,c=>c.toUpperCase());
      }
      const matchKey=Object.keys(PT_DISTRICTS).find(k=>part===k||part.includes(k));
      if(matchKey)return matchKey.replace(/\b\w/g,c=>c.toUpperCase());
    }
    return '';
  }

  function resolveCountryForItem(item,area){
    if(item.countryName&&String(item.countryName).trim())return String(item.countryName).trim();
    if(area||resolveDistrictForItem(item,area)||resolveMunicipalityForItem(item,area))return 'Portugal';
    const text=norm(`${item.locationName||''} ${item.suggestedLocation||''}`);
    if(!text||text===norm('Local indicado no mapa'))return '';
    if(text.includes('franca')||text.includes('france')||text.includes('nantes')||text.includes('paris'))return 'França';
    if(text.includes('espanha')||text.includes('spain')||text.includes('salamanca')||text.includes('sevilha')||text.includes('sevilla'))return 'Espanha';
    if(text.includes('marrocos')||text.includes('morocco'))return 'Marrocos';
    const parts=String(item.locationName||item.suggestedLocation||'').split(',').map(s=>s.trim()).filter(Boolean);
    return parts.length>1?parts[parts.length-1]:'';
  }

  function updateStats(){
    const visible=getFilteredMemories();
    const towns=new Set(),districts=new Set(),places=new Set(),countries=new Set();
    let located=0;
    visible.forEach(item=>{
      const area=resolveArea(item);
      const hasCoords=Number.isFinite(item.lat)&&Number.isFinite(item.lng);
      const rawPlace=String(item.locationName||item.suggestedLocation||item.countryName||'').trim();
      const hasPlace=Boolean(rawPlace)&&rawPlace!=='Local indicado no mapa';
      if(!area&&!hasCoords&&!hasPlace)return;
      located++;
      const town=resolveMunicipalityForItem(item,area);
      const district=resolveDistrictForItem(item,area);
      const country=resolveCountryForItem(item,area);
      const place=placeName(item);
      if(town)towns.add(norm(town));
      if(district)districts.add(norm(district));
      if(country)countries.add(norm(country));
      if(place&&place!=='Outros locais')places.add(norm(place));
    });
    if($('placeCount'))$('placeCount').textContent=String(places.size);
    if($('municipalityCount'))$('municipalityCount').textContent=`${towns.size} de ${municipalities.length||TOTAL_MUNICIPALITIES}`;
    if($('districtCount'))$('districtCount').textContent=`${districts.size} de ${TOTAL_DISTRICTS}`;
    if($('countryCount'))$('countryCount').textContent=String(countries.size);
    if($('locatedPhotoCount'))$('locatedPhotoCount').textContent=String(located);
    if($('unlocatedPhotoCount'))$('unlocatedPhotoCount').textContent=String(Math.max(0,visible.length-located));
    if($('onboarding'))$('onboarding').hidden=visible.length>=3;
  }

  async function enrichMissingGeoNames(){
    if(reverseQueueRunning)return;
    const candidates=allMemories.filter(item=>Number.isFinite(item.lat)&&Number.isFinite(item.lng)&&(!item.countryName||(!resolveMunicipalityForItem(item,resolveArea(item))&&!item.locationName)));
    if(!candidates.length)return;
    reverseQueueRunning=true;
    const cache=new Map();
    const updates=[];
    try{
      for(const item of candidates){
        const key=`${item.lat.toFixed(3)},${item.lng.toFixed(3)}`;
        let info=cache.get(key);
        if(!info){
          try{
            const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${item.lat}&lon=${item.lng}&zoom=10&accept-language=pt`,{headers:{Accept:'application/json'}});
            if(res.ok){
              const data=await res.json();
              const addr=data.address||{};
              const countryCode=String(addr.country_code||'').toLowerCase();
              const countryName=addr.country||'';
              const isPT=countryCode==='pt'||norm(countryName)==='portugal';
              const muni=isPT?(addr.municipality||addr.city||addr.town||addr.village||addr.county||''):'';
              const dist=isPT?(addr.state_district||addr.county||addr.state||PT_DISTRICTS[norm(muni)]||''):'';
              const place=addr.city||addr.town||addr.village||addr.municipality||addr.county||data.name||'';
              info={muni,dist,place,countryName,display:data.display_name||''};
              cache.set(key,info);
            }
          }catch(_){}
          await new Promise(r=>setTimeout(r,350));
        }
        if(info&&(info.muni||info.dist||info.place||info.countryName)){
          updates.push({
            ...item,
            municipalityName:item.municipalityName||info.muni,
            districtName:item.districtName||info.dist||PT_DISTRICTS[norm(info.muni)]||'',
            countryName:item.countryName||info.countryName,
            locationName:item.locationName||info.place||info.display
          });
        }
      }
      if(updates.length){
        await writeMany(updates);
        allMemories=await getMemories();
        applyYearView();
      }
    }finally{
      reverseQueueRunning=false;
    }
  }

  function openArchive(item){
    const target=placeName(item);
    window.__retalhosPendingLocation=target;
    window.dispatchEvent(new CustomEvent('retalhos-open-location',{detail:{location:target,item}}));
  }

  function getMarkerDimensions(zoom){
    const z=Number.isFinite(zoom)?zoom:DEFAULT_ZOOM;
    const t=Math.max(0,Math.min(1,(z-6)/10));
    const width=Math.round(14+70*Math.pow(t,1.55));
    const height=Math.round(width*0.75);
    return {width,height};
  }

  function markerIcon(item,zoom){
    const {width,height}=getMarkerDimensions(zoom);
    const image=document.createElement('img');
    image.src=imageUrl(item);
    image.alt=item.name||'Retalho';
    image.style.display='block';
    image.style.width='100%';
    image.style.height='100%';
    const node=document.createElement('div');
    node.className='retalhos-photo-marker';
    node.style.width=`${width}px`;
    node.style.height=`${height}px`;
    node.appendChild(image);
    return L.divIcon({className:'retalhos-photo-marker',html:node,iconSize:[width,height],iconAnchor:[Math.round(width/2),Math.round(height/2)]});
  }

  function groupExactCoordinates(items){
    const groups=new Map();
    items.filter(m=>Number.isFinite(m.lat)&&Number.isFinite(m.lng)).forEach(m=>{
      const key=`${m.lat.toFixed(6)},${m.lng.toFixed(6)}`;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(m);
    });
    return [...groups.values()].map(list=>{
      list.sort((a,b)=>(a.takenAt||a.created||0)-(b.takenAt||b.created||0));
      return list;
    });
  }

  function renderMarkers(){
    if(!map||!markerLayer)return;
    markerLayer.clearLayers();
    const zoom=map.getZoom();
    const visible=getFilteredMemories();
    const groups=groupExactCoordinates(visible).sort((a,b)=>{
      const timeA=a[a.length-1]?.takenAt||a[a.length-1]?.created||0;
      const timeB=b[b.length-1]?.takenAt||b[b.length-1]?.created||0;
      return timeA-timeB;
    });
    groups.forEach((items,index)=>{
      const item=items[items.length-1];
      const marker=L.marker([item.lat,item.lng],{
        icon:markerIcon(item,zoom),
        title:`Abrir ${placeName(item)}`,
        zIndexOffset:(index+1)*10
      });
      marker.on('click',()=>openArchive(item));
      markerLayer.addLayer(marker);
    });
  }

  function initMap(){
    if(!window.L||!mapElement){notify('O mapa não carregou. Verifica a ligação à internet.');return;}
    if(mapElement._leaflet_id)return;
    map=L.map(mapElement,{zoomControl:true,scrollWheelZoom:true,touchZoom:true,doubleClickZoom:true,minZoom:2,maxZoom:18,worldCopyJump:true});
    markerLayer=L.layerGroup().addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{minZoom:2,maxZoom:18,attribution:'Imagery © Esri, Maxar, Earthstar Geographics and GIS community'}).addTo(map);
    let cover=null;try{cover=JSON.parse(localStorage.getItem(COVER_KEY)||'null');}catch(_){}
    map.setView(cover?.center&&Number.isFinite(cover.zoom)?cover.center:DEFAULT_CENTER,cover?.center&&Number.isFinite(cover.zoom)?cover.zoom:DEFAULT_ZOOM);
    map.on('zoomend moveend',renderMarkers);
    window.retalhosMap=map;
    if($('saveCover'))$('saveCover').onclick=()=>{const c=map.getCenter();localStorage.setItem(COVER_KEY,JSON.stringify({center:[c.lat,c.lng],zoom:map.getZoom()}));notify('Vista guardada neste dispositivo (centro e zoom).');};
    if($('resetCover'))$('resetCover').onclick=()=>{let c=null;try{c=JSON.parse(localStorage.getItem(COVER_KEY)||'null');}catch(_){}map.flyTo(c?.center||DEFAULT_CENTER,c?.zoom||DEFAULT_ZOOM,{duration:.7});};
    window.addEventListener('resize',()=>map.invalidateSize({pan:false}));
    setTimeout(()=>map.invalidateSize({pan:false}),150);
  }

  function updateAssignButton(){if(!$('assignPendingPlace'))return;const count=document.querySelectorAll('.pending-check:checked').length;$('assignPendingPlace').disabled=!selectedPlace||count===0;$('assignPendingPlace').textContent=selectedPlace?`Atribuir ${selectedPlace.name} (${count})`:'Atribuir local às selecionadas';}
  function renderPending(){const pending=getFilteredMemories().filter(m=>!Number.isFinite(m.lat)||!Number.isFinite(m.lng));if($('pendingCount'))$('pendingCount').textContent=String(pending.length);if($('pendingSection'))$('pendingSection').hidden=pending.length===0;const list=$('pendingList');if(!list)return;list.replaceChildren();pending.forEach(item=>{const card=document.createElement('article'),img=document.createElement('img'),label=document.createElement('label'),check=document.createElement('input'),name=document.createElement('span');card.className='pending-card';img.src=imageUrl(item);img.alt=item.name||'Fotografia';check.type='checkbox';check.className='pending-check';check.value=item.id;check.addEventListener('change',updateAssignButton);name.textContent=item.name||'Fotografia sem nome';label.append(check,name);card.append(img,label);list.appendChild(card);});if($('selectAllPending'))$('selectAllPending').checked=false;updateAssignButton();}

  async function searchPendingPlace(){
    const query=$('pendingPlaceSearch')?.value.trim()||'',box=$('pendingPlaceResults');
    if(!box)return;box.replaceChildren();selectedPlace=null;updateAssignButton();
    if(query.length<2){box.textContent='Escreve pelo menos duas letras.';return;}
    try{
      const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=pt&q=${encodeURIComponent(query)}`,{headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`Pesquisa indisponível (${response.status})`);
      const results=await response.json();
      if(!results.length){box.textContent='Não encontrei esse local.';return;}
      results.forEach(result=>{
        const addr=result.address||{};
        const isPT=String(addr.country_code||'').toLowerCase()==='pt';
        const muni=isPT?(addr.municipality||addr.city||addr.town||addr.village||addr.county||''):'';
        const dist=isPT?(addr.state_district||addr.county||addr.state||PT_DISTRICTS[norm(muni)]||''):'';
        const button=document.createElement('button');
        button.type='button';
        button.className='pending-place-result';
        button.textContent=result.display_name;
        button.onclick=()=>{
          selectedPlace={
            name:result.name||result.display_name.split(',')[0],
            displayName:result.display_name,
            lat:Number(result.lat),
            lng:Number(result.lon),
            municipalityName:muni,
            districtName:dist,
            countryName:addr.country||''
          };
          box.querySelectorAll('button').forEach(b=>b.removeAttribute('aria-pressed'));
          button.setAttribute('aria-pressed','true');
          map?.flyTo([selectedPlace.lat,selectedPlace.lng],12,{duration:.6});
          updateAssignButton();
        };
        box.appendChild(button);
      });
    }catch(e){console.warn(e);box.textContent='Não foi possível procurar agora. Tenta novamente mais tarde.';}
  }

  async function assignPending(){
    if(!selectedPlace)return;
    const ids=[...document.querySelectorAll('.pending-check:checked')].map(x=>x.value),items=allMemories.filter(x=>ids.includes(x.id));
    if(!items.length)return;
    try{
      await writeMany(items.map(item=>({
        ...item,
        lat:selectedPlace.lat,
        lng:selectedPlace.lng,
        locationName:selectedPlace.displayName,
        municipalityName:selectedPlace.municipalityName||'',
        districtName:selectedPlace.districtName||'',
        countryName:selectedPlace.countryName||'',
        locationSource:'manual'
      })));
      selectedPlace=null;
      if($('pendingPlaceResults'))$('pendingPlaceResults').replaceChildren();
      if($('pendingPlaceSearch'))$('pendingPlaceSearch').value='';
      await refresh();
      notify(`${items.length} fotografia(s) localizada(s). Os contadores foram atualizados.`);
    }catch(e){storageError(e);}
  }

  function renderQuiltPrintSheet(){
    const yearVal=$('printYearSelect')?.value||selectedYear||'all';
    const items=(yearVal==='all'?allMemories:allMemories.filter(m=>getItemYear(m)===yearVal))
      .slice()
      .sort((a,b)=>(a.takenAt||a.created||0)-(b.takenAt||b.created||0));
    if($('printQuiltTitle'))$('printQuiltTitle').textContent=yearVal==='all'?'Manta de Retalhos — Todos os anos':`Manta de Retalhos — ${yearVal}`;
    const places=new Set(items.map(placeName).filter(p=>p&&p!=='Outros locais'));
    if($('printQuiltMeta'))$('printQuiltMeta').textContent=`${items.length} retalho(s) · ${places.size} lugar(es)`;
    const grid=$('printQuiltGrid');
    if(!grid)return;
    grid.replaceChildren();
    items.forEach(item=>{
      const tile=document.createElement('div');
      tile.className='print-quilt-tile';
      const img=document.createElement('img');
      img.src=imageUrl(item);
      img.alt=item.name||placeName(item);
      tile.appendChild(img);
      grid.appendChild(tile);
    });
  }

  function applyYearView(){
    const visible=getFilteredMemories();
    const located=visible.filter(item=>Number.isFinite(item.lat)&&Number.isFinite(item.lng)).length;
    if($('mapStatus'))$('mapStatus').textContent=located?`${located} RETALHOS NO MAPA`:'PORTUGAL · OS TEUS RETALHOS';
    renderMarkers();
    renderPending();
    updateStats();
    window.dispatchEvent(new CustomEvent('retalhos-data-changed',{detail:{year:selectedYear,memories:visible}}));
  }

  function storageError(error){console.error('Falha ao guardar fotografia:',error);if(error?.name==='QuotaExceededError')notify('O armazenamento do telemóvel está cheio. Exporta uma cópia e liberta espaço.');else notify(`Não foi possível guardar a fotografia: ${error?.message||error?.name||'erro de armazenamento'}.`);}
  async function refresh(){try{allMemories=await getMemories();renderYearFilters();applyYearView();enrichMissingGeoNames();}catch(error){console.error('Não foi possível carregar as memórias:',error);notify('Não foi possível abrir o arquivo de fotografias neste navegador.');}}
  function dataUrlToBlob(dataUrl){const [meta,encoded]=dataUrl.split(','),mime=meta.match(/data:([^;]+)/)?.[1]||'application/octet-stream',binary=atob(encoded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type:mime});}
  async function exportBackup(){try{const memories=await getMemories(),items=[];for(const {blob,...item} of memories){let blobData=null;if(blob instanceof Blob)blobData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});items.push({...item,blobData});}const content=JSON.stringify({format:'retalhos-backup-v1',createdAt:new Date().toISOString(),memories:items}),url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`retalhos-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Cópia de segurança exportada. Guarda-a num local seguro.');}catch(e){console.error(e);notify(`Não foi possível exportar a cópia: ${e.message||'erro'}`);}}
  async function importBackup(file){const data=JSON.parse(await file.text());if(!data||data.format!=='retalhos-backup-v1'||!Array.isArray(data.memories))throw new Error('O ficheiro não é uma cópia Retalhos válida.');const memories=data.memories.map(({blobData,...item})=>({...item,blob:blobData?dataUrlToBlob(blobData):null}));await writeMany(memories);await refresh();notify(`${memories.length} memória(s) reposta(s).`);}
  async function readMetadata(file){try{const exif=await window.exifr?.parse(file,{gps:true,exif:true});return{lat:Number.isFinite(exif?.latitude)?exif.latitude:null,lng:Number.isFinite(exif?.longitude)?exif.longitude:null,takenAt:exif?.DateTimeOriginal instanceof Date?exif.DateTimeOriginal.getTime():null};}catch(e){console.info('Sem EXIF legível:',e);return{lat:null,lng:null,takenAt:null};}}
  async function storageBlob(file){if(file.size<1500000||!('createImageBitmap'in window))return file;let bitmap;try{bitmap=await createImageBitmap(file);const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.84));return blob&&blob.size<file.size?blob:file;}catch(e){console.warn('Sem compressão da imagem:',e);return file;}finally{bitmap?.close();}}

  function resolveImportTimestamp(exifDate){
    const chosenStr=$('importDateInput')?.value||'';
    const forceAll=Boolean($('forceImportDate')?.checked);
    const chosenTs=chosenStr?new Date(`${chosenStr}T12:00:00`).getTime():null;
    if(forceAll&&chosenTs&&Number.isFinite(chosenTs))return chosenTs;
    if(exifDate&&Number.isFinite(exifDate))return exifDate;
    if(chosenTs&&Number.isFinite(chosenTs))return chosenTs;
    return Date.now();
  }

  async function importFiles(event){const input=event.currentTarget,files=[...(input.files||[])].filter(file=>file.type.startsWith('image/'));if(!files.length){input.value='';return;}input.disabled=true;let saved=0;notify(`A guardar ${files.length} fotografia(s)…`);try{for(const file of files){const meta=await readMetadata(file),blob=await storageBlob(file),takenAt=resolveImportTimestamp(meta.takenAt);await writeMany([{id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,name:file.name.replace(/\.[^.]+$/,'')||'Fotografia',blob,type:blob.type||file.type,lat:meta.lat,lng:meta.lng,locationSource:meta.lat!==null?'gps':'pending',locationName:'',municipalityName:'',districtName:'',countryName:'',takenAt,created:Date.now()}]);saved++;}}catch(error){storageError(error);}finally{input.disabled=false;input.value='';await refresh();if(saved)notify(`${saved} fotografia(s) guardada(s).${saved<files.length?' Algumas não foram guardadas; verifica o espaço disponível.':''}`);}}

  if($('importDateInput')&&!$('importDateInput').value)$('importDateInput').value=new Date().toISOString().slice(0,10);
  $('galleryImport')?.addEventListener('click',()=>photoInput?.click());$('cameraImport')?.addEventListener('click',()=>cameraInput?.click());photoInput?.addEventListener('change',importFiles);cameraInput?.addEventListener('change',importFiles);
  $('searchPendingPlace')?.addEventListener('click',searchPendingPlace);$('pendingPlaceSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchPendingPlace();});$('assignPendingPlace')?.addEventListener('click',assignPending);$('selectAllPending')?.addEventListener('change',e=>{document.querySelectorAll('.pending-check').forEach(c=>c.checked=e.target.checked);updateAssignButton();});
  $('exportBackup')?.addEventListener('click',exportBackup);$('importBackup')?.addEventListener('click',()=>backupInput?.click());backupInput?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;if(!confirm('Importar a cópia e juntar as memórias ao arquivo atual?')){backupInput.value='';return;}try{await importBackup(file);}catch(error){console.error(error);notify(error.message||'Não foi possível importar a cópia.');}finally{backupInput.value='';}});
  $('openQuiltPrint')?.addEventListener('click',()=>{if($('printYearSelect'))$('printYearSelect').value=selectedYear;renderQuiltPrintSheet();if($('quiltPrintModal'))$('quiltPrintModal').hidden=false;});
  $('closeQuiltPrint')?.addEventListener('click',()=>{if($('quiltPrintModal'))$('quiltPrintModal').hidden=true;});
  $('printYearSelect')?.addEventListener('change',renderQuiltPrintSheet);
  $('triggerPrintQuilt')?.addEventListener('click',()=>window.print());
  initMap();refresh();
  (async()=>{try{const url='https://ogcapi.dgterritorio.gov.pt/collections/municipios/items?f=json&limit=500&crs=http://www.opengis.net/def/crs/OGC/1.3/CRS84',response=await fetch(url,{headers:{Accept:'application/geo+json'}});if(!response.ok)throw new Error(`DGT HTTP ${response.status}`);municipalities=((await response.json()).features||[]).filter(f=>f.geometry);await refresh();}catch(e){console.warn('Dados geográficos indisponíveis:',e);updateStats();}})();
  if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./service-worker.js').catch(e=>console.warn('Service worker:',e));
})();
