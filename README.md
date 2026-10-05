# Fluxo Jurídico — PWA para iPhone/iPad

Esta versão mantém o mesmo Supabase e os mesmos usuários do sistema publicado.

## Instalar no iPhone
1. Abra o endereço do Fluxo Jurídico no Safari.
2. Toque em Compartilhar.
3. Toque em **Adicionar à Tela de Início**.
4. Confirme em **Adicionar**.

O app passa a abrir em modo standalone, com ícone próprio e suporte às áreas seguras do iPhone.

## Arquivos desta atualização
- `index.html`: metadados iOS, safe areas e instrução de instalação.
- `manifest.webmanifest`: manifesto PWA completo.
- `sw.js`: cache apenas do shell local (não armazena respostas do Supabase/Google).
- `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`.

Os dados dos clientes continuam somente no Supabase; este pacote não incorpora a planilha de clientes.
