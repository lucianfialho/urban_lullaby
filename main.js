const fs = require("fs");
const path = require("path");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmetadata = require("ffmetadata");
require("dotenv").config()

// Função para normalizar o nome do arquivo em snake_case
const toSnakeCase = (str) => {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

// Configurações
const SEARCH_TERM = "lofi hip hop 2000";
const OUTPUT_DIR = path.join(
  __dirname,
  `music/playlist_${new Date().toISOString().split("T")[0]}`
);
const STREAM_KEY = process.env.YOUTUBE_STREAM_KEY;
const STREAM_URL = process.env.YOUTUBE_STREAM_URL;
const VIDEO_FILE = path.join(__dirname, "background/video.mp4"); // Video de fundo

// Variável para rastrear o último dia
let lastDate = new Date().toISOString().split("T")[0];

// Função para limpar o diretório
const cleanDirectory = (dir) => {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((file) => {
      const filePath = path.join(dir, file);
      if (fs.lstatSync(filePath).isDirectory()) {
        cleanDirectory(filePath); // Recursivamente limpa subdiretórios
      } else {
        fs.unlinkSync(filePath); // Remove arquivos
      }
    });
    console.log(`Diretório limpo: ${dir}`);
  } else {
    console.log(`Diretório não existe, criando: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Função para buscar e baixar músicas
const downloadMusic = async (searchTerm) => {
  try {
    const term = encodeURIComponent(searchTerm);
    const searchUrl = `https://www.epidemicsound.com/music/search/?term=${term}`;
    const jsonUrl =
      searchUrl.replace("music/search", "json/search/tracks") +
      "&translate_text=false&order=desc&sort=relevance&limit=40";

    console.log(`Buscando músicas em: ${jsonUrl}`);
    const response = await axios.get(jsonUrl);

    if (!response.data.entities || !response.data.entities.tracks) {
      console.error("Erro: A resposta da API não contém dados de músicas.");
      return [];
    }

    const entities = response.data.entities.tracks;

    let count = 0;
    const downloadedTracks = [];

    for (let trackId in entities) {
      if (!entities.hasOwnProperty(trackId)) continue;

      const track = entities[trackId];

      const title = track?.title;
      const artist = track?.creatives?.mainArtists?.[0]?.name;

      if (!title || !artist) {
        console.warn(
          `Música sem título ou artista encontrada. ID do track: ${trackId}. Ignorando...`
        );
        continue;
      }

      const audioUrl = track?.stems?.full?.lqMp3Url;

      if (audioUrl) {
        const filename = `${toSnakeCase(artist)}_${toSnakeCase(title)}.mp3`;
        const filepath = path.join(OUTPUT_DIR, filename);

        console.log(`Baixando: ${title} de ${artist}...`);
        const writer = fs.createWriteStream(filepath);
        const audioResponse = await axios({
          url: audioUrl,
          method: "GET",
          responseType: "stream",
        });
        audioResponse.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        const metadata = {
          title: title,
          artist: artist,
        };
        ffmetadata.write(filepath, metadata, (err) => {
          if (err) console.error("Erro ao adicionar metadados: ", err);
        });

        downloadedTracks.push(filepath);
        count++;
      } else {
        console.warn(
          `URL de áudio não encontrada para a música "${title}" de ${artist}`
        );
      }
    }

    if (count === 0) {
      console.error("Nenhuma música válida foi encontrada para download.");
    }

    return downloadedTracks;
  } catch (error) {
    console.error("Erro ao buscar músicas: ", error.message);
    return [];
  }
};

// Função para criar a playlist
const createPlaylist = (outputDir, tracks) => {
  if (!outputDir || typeof outputDir !== "string") {
    console.error(
      'Erro: O argumento "outputDir" está indefinido ou não é uma string válida.'
    );
    return null;
  }

  if (!Array.isArray(tracks) || tracks.length === 0) {
    console.error(
      'Erro: A lista de "tracks" está indefinida, vazia ou não é um array.'
    );
    return null;
  }

  console.log("Criando arquivo .ffconcat no diretório:", outputDir);

  try {
    const playlistPath = path.join(outputDir, "playlist.ffconcat");
    console.log("Caminho da playlist:", playlistPath);

    const playlistContent = ["ffconcat version 1.0"]
      .concat(
        tracks.map((track) => {
          return `file '${track}'`;
        })
      )
      .join("\n");

    fs.writeFileSync(playlistPath, playlistContent, "utf-8");
    console.log(`Arquivo .ffconcat criado: ${playlistPath}`);
    return playlistPath;
  } catch (error) {
    console.error("Erro ao criar o arquivo .ffconcat:", error.message);
    return null;
  }
};

// Função para combinar todos os arquivos de música em um único arquivo MP3
const combineTracks = async (outputDir, tracks) => {
  const outputFilePath = path.join(outputDir, "output.mp3");
  return new Promise((resolve, reject) => {
    const ffmpegCommand = ffmpeg();

    tracks.forEach((track) => {
      ffmpegCommand.input(track);
    });

    ffmpegCommand
      .on("error", (err) => {
        console.error("Erro ao combinar as músicas:", err.message);
        reject(err);
      })
      .on("end", () => {
        console.log("Músicas combinadas com sucesso em:", outputFilePath);
        resolve(outputFilePath);
      })
      .mergeToFile(outputFilePath);
  });
};

// Função para iniciar o streaming
const startStreaming = async (combinedFile) => {
  try {
    const convertedVideoPath = path.join(__dirname, "background/converted_video.mp4");
    const convertedAudioPath = path.join(
      path.dirname(combinedFile),
      "converted_audio.mp3"
    );

    // Converter arquivos, se necessário
    if (!fs.existsSync(convertedVideoPath)) {
      console.log("Convertendo vídeo de fundo...");
      await convertFile(VIDEO_FILE, convertedVideoPath, "video");
    }
    console.log("Convertendo áudio combinado...");
    await convertFile(combinedFile, convertedAudioPath, "audio");

    // Iniciar transmissão
    ffmpeg()
      .input(convertedAudioPath)
      .inputOptions(["-re", "-stream_loop -1"]) // Tempo real + loop
      .input(convertedVideoPath)
      .inputOptions(["-re", "-stream_loop -1"])
      .videoCodec("libx264")
      .audioCodec("aac")
      .addOption("-b:v", "2500k")
      .addOption("-maxrate", "2500k")
      .addOption("-bufsize", "5000k")
      .addOption("-b:a", "128k")
      .addOption("-pix_fmt", "yuv420p")
      .addOption("-preset", "ultrafast")
      .addOption("-r", "24")
      .addOption("-g", "48") // Keyframes a cada 2 segundos
      .format("flv")
      .output(`${STREAM_URL}/${STREAM_KEY}`)
      .on("start", (cmd) => {
        console.log("Transmissão iniciada. Comando:", cmd);
      })
      .on("stderr", (stderrLine) => {
        console.log("FFmpeg STDERR:", stderrLine);
      })
      .on("error", (err) => {
        console.error("Erro FFmpeg:", err.message);
      })
      .on("end", () => {
        console.log("Transmissão encerrada.");
      })
      .run();
  } catch (error) {
    console.error("Erro durante a transmissão:", error.message);
  }
};

// Função principal para baixar músicas, criar playlist e iniciar o streaming
const run = async () => {
  const currentDate = new Date().toISOString().split("T")[0];

  // Limpa a pasta se for um novo dia
  if (currentDate !== lastDate) {
    console.log("Novo dia detectado. Limpando a pasta de músicas...");
    cleanDirectory(OUTPUT_DIR);
    lastDate = currentDate; // Atualiza o último dia
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const downloadedTracks = await downloadMusic(SEARCH_TERM);

  if (downloadedTracks.length > 0) {
    const playlistPath = createPlaylist(OUTPUT_DIR, downloadedTracks);
    if (playlistPath) {
      try {
        const combinedFile = await combineTracks(OUTPUT_DIR, downloadedTracks);
        startStreaming(combinedFile);
      } catch (error) {
        console.error(
          "Erro: Não foi possível combinar as músicas para streaming."
        );
      }
    } else {
      console.error(
        "Erro: A transmissão não pode ser iniciada pois a playlist não foi criada."
      );
    }
  } else {
    console.error("Erro: Nenhuma música foi baixada.");
  }
};

const convertFile = async (inputPath, outputPath, type) => {
  return new Promise((resolve, reject) => {
    const ffmpegCommand = ffmpeg(inputPath);

    if (type === "audio") {
      ffmpegCommand
        .audioCodec("libmp3lame")
        .outputOptions(["-b:a 128k"]); // Mantendo o bitrate para consistência
    }

    ffmpegCommand
      .on("start", (cmd) => {
        console.log("Comando executado pelo FFmpeg:", cmd);
      })
      .on("error", (err) => {
        console.error(`Erro ao converter ${inputPath}:`, err.message);
        reject(err);
      })
      .on("end", () => {
        console.log(`Arquivo convertido com sucesso: ${outputPath}`);
        resolve(outputPath);
      })
      .save(outputPath);
  });
};



// Agendar para rodar diariamente
setInterval(run, 1 * 60 * 60 * 1000); // Executa a cada 1 hora
run(); // Executa imediatamente na inicialização
