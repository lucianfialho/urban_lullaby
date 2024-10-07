const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const playlistPath =
  "/Users/lucianfialho/Code/urban_lulaby/music/playlist_2024-10-05/playlist.m3u";
const musicDirectory = "./";

function verificarArquivosPlaylist(playlistPath) {
  if (!fs.existsSync(playlistPath)) {
    console.error("Erro: O arquivo de playlist não foi encontrado.");
    return false;
  }

  const content = fs.readFileSync(playlistPath, "utf-8");
  const tracks = content.split("\n").filter((line) => line.trim() !== "");

  let allFilesExist = true;
  for (const track of tracks) {
    const trackPath = path.join(musicDirectory, track.trim());
    if (!fs.existsSync(trackPath)) {
      console.error(
        `Erro: O arquivo de música não foi encontrado: ${trackPath}`
      );
      allFilesExist = false;
    } else {
      console.log(`Arquivo encontrado: ${trackPath}`);
    }
  }

  return allFilesExist;
}

function verificarPermissoesArquivos(playlistPath) {
  const content = fs.readFileSync(playlistPath, "utf-8");
  const tracks = content.split("\n").filter((line) => line.trim() !== "");

  let allFilesAccessible = true;
  for (const track of tracks) {
    const trackPath = path.join(musicDirectory, track.trim());
    try {
      fs.accessSync(trackPath, fs.constants.R_OK);
      console.log(`Permissão de leitura OK: ${trackPath}`);
    } catch (err) {
      console.error(`Erro: Sem permissão para ler o arquivo: ${trackPath}`);
      allFilesAccessible = false;
    }
  }

  return allFilesAccessible;
}

function testarFFmpeg(playlistPath) {
  const ffmpegCommand = `ffmpeg -v error -f concat -safe 0 -i "${playlistPath}" -f null -`;
  exec(ffmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Erro ao testar o ffmpeg: ${stderr}`);
      return;
    }
    console.log("Teste do ffmpeg concluído com sucesso.");
  });
}

function ajustarPlaylist(playlistPath) {
  if (!fs.existsSync(playlistPath)) {
    console.error("Erro: O arquivo de playlist não foi encontrado.");
    return;
  }

  const content = fs.readFileSync(playlistPath, "utf-8");
  const tracks = content.split("\n").filter((line) => line.trim() !== "");
  const adjustedTracks = tracks.map((track) => path.basename(track.trim()));
  fs.writeFileSync(playlistPath, adjustedTracks.join("\n"), "utf-8");
  console.log("Playlist ajustada para conter apenas os nomes dos arquivos.");
}

function main() {
  console.log("Ajustando playlist...");
  ajustarPlaylist(playlistPath);

  console.log("Verificando arquivos da playlist...");
  const arquivosExistem = verificarArquivosPlaylist(playlistPath);

  if (!arquivosExistem) {
    console.error(
      "Erro: Um ou mais arquivos de música não foram encontrados. Verifique a playlist."
    );
    return;
  }

  console.log("Verificando permissões dos arquivos...");
  const permissoesOK = verificarPermissoesArquivos(playlistPath);

  if (!permissoesOK) {
    console.error(
      "Erro: Sem permissão para acessar um ou mais arquivos de música."
    );
    return;
  }

  console.log("Testando execução do ffmpeg...");
  testarFFmpeg(playlistPath);
}

main();
