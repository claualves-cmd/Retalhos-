# Retalhos — Protótipo 0.4

O Retalhos transforma fotografias geolocalizadas numa colcha de memórias sobre um mapa mundial de satélite.

## Ficheiros
- `index.html` — estrutura da aplicação
- `estilos.css` — identidade visual e apresentação
- `app.js` — mapa, importação em massa, GPS EXIF, armazenamento local e territórios fotográficos Voronoi
- `manifest.json` — instalação PWA
- `service-worker.js` — cache da aplicação
- `icon-192.png` e `icon-512.png` — ícones PWA

## Funcionalidades do protótipo
- Mapa mundial de satélite, com navegação livre por arrastamento e zoom tátil.
- Capas predefinidas: Portugal, Mundo, Açores, Madeira, França e Marrocos.
- Possibilidade de guardar a vista atual como capa.
- Importação de várias fotografias de uma só vez.
- Leitura de coordenadas GPS EXIF quando existem.
- Fotografias sem GPS ficam numa lista para localização manual, uma a uma.
- As fotografias geolocalizadas são desenhadas como regiões Voronoi, preenchidas com as próprias imagens. O mapa de satélite permanece visível nas áreas ainda sem memórias.
- Fotografias na mesma coordenada partilham um retalho e ficam agrupadas no popup.
- Memórias guardadas localmente no dispositivo através de IndexedDB.

## Publicação
Colocar todos os ficheiros diretamente na raiz do repositório GitHub Pages. A aplicação usa HTTPS e carrega Leaflet e exifr de CDNs externas; o mapa de satélite usa o serviço World Imagery da Esri, com atribuição no mapa.

## Notas importantes
- O protótipo guarda as fotografias no dispositivo onde são importadas. Ainda não existe sincronização entre telemóveis ou contas.
- O GPS só é automático se os metadados da imagem incluírem coordenadas.
- A cobertura, resolução e atualização das imagens de satélite dependem do fornecedor cartográfico.
- Os territórios Voronoi são recalculados no ecrã à medida que o mapa se move ou muda de zoom. Para bibliotecas muito grandes, será necessário otimizar o cálculo e a apresentação.
