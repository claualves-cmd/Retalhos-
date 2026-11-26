# Retalhos — protótipo 0.2

## Publicar no GitHub Pages
1. No repositório, substitui os ficheiros antigos pelos ficheiros desta pasta.
2. Mantém todos estes ficheiros na raiz do repositório (ao lado do README).
3. Em **Settings → Pages**, confirma que a publicação está ativa a partir do ramo principal (`main`) e da pasta `/(root)`.
4. Aguarda a publicação e abre o endereço HTTPS do GitHub Pages.
5. No Android, abre o endereço no Chrome. A instalação pode surgir no menu ⋮ → **Instalar aplicação** ou **Adicionar ao ecrã principal**.

## O que esta versão já faz
- Abre um mapa de imagem de satélite com Leaflet e permite zoom/deslocação.
- Tenta carregar o contorno geográfico de Portugal continental a partir de GeoJSON Natural Earth.
- Permite escolher um ponto no mapa, adicionar várias fotografias e guardá-las localmente no dispositivo (IndexedDB).
- Mostra as memórias numa galeria e permite voltar ao respetivo ponto no mapa.
- Inclui manifesto, ícones e service worker para instalação PWA.

## Limitações desta versão
É uma base funcional para testar mapa, seleção de coordenadas, arquivo e instalação. Ainda **não** implementa o mosaico Voronoi com fotografias a preencher territórios, animações de transformação, leitura automática de GPS EXIF, sincronização entre dispositivos ou modo offline de imagens de satélite. O mapa e o contorno dependem de serviços externos e de ligação à internet. As fotografias ficam apenas no dispositivo onde foram adicionadas.

## Créditos e serviços externos
- Mapa: Esri World Imagery (a camada de satélite é servida online; respeitar os termos e limites do fornecedor).
- Contorno nacional: Natural Earth 1:10m, disponibilizado em GeoJSON pelo GISGP; geometria generalizada adequada a mapa de país, não a medições legais/cadastrais.
- Biblioteca cartográfica: Leaflet 1.9.4.
