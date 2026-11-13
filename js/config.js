// Configurações públicas do app. Nada aqui é segredo: o ID do cliente e a
// chave de API só funcionam a partir de https://apto305.github.io e a
// chave está restrita à Google Picker API.
export const CONFIG = {
  clientId: '259247781237-o0itpfi50agsje5urll18fhubdho6o2u.apps.googleusercontent.com',
  apiKey: 'AIzaSyAVr1vaIk9_Ga_8x32KRt82XMKhyOShnEc',
  appId: '259247781237', // número do projeto no Google Cloud (para o seletor de arquivos)
  escopos: 'openid email profile https://www.googleapis.com/auth/drive.file',
  versaoApp: '1.11',
  versaoPlanilhaMinima: '1.6',
};
