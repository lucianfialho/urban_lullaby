const fs = require("fs");
const path = require("path");

const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const ffmetadata = require("ffmetadata");

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
const STREAM_KEY = "fkz1-p7w2-scd0-v5df-csxe";
const STREAM_URL = "rtmp://a.rtmp.youtube.com/live2";
const VIDEO_FILE = path.join(__dirname, "background/video.mp4"); // Video de fundo

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

      // Acessando o título e o artista corretamente
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

        // Adicionar metadados no arquivo baixado
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
const startStreaming = (combinedFile) => {
  ffmpeg()
    .input(combinedFile)
    .inputOptions(["-stream_loop -1"])
    .input(VIDEO_FILE)
    .inputOptions(["-stream_loop -1"])
    .addOption("-filter_complex", "[1:v]scale=-1:1080[v]")
    .addOption("-map", "[v]")
    .addOption("-map", "0:a")
    .videoCodec("libx264")
    .audioCodec("aac")
    .addOption("-b:a", "128k")
    .addOption("-pix_fmt", "yuv420p")
    .addOption("-preset", "medium")
    .addOption("-g", "50")
    .addOption("-sc_threshold", "0")
    .addOption("-profile:v", "baseline")
    .addOption("-b:v", "4000k")
    .addOption("-maxrate", "4000k")
    .addOption("-bufsize", "4000k")
    .addOption("-shortest")
    .addOption("-threads", "0")
    .addOption("-r", "30")
    .addOption("-video_size", "1920x1080")
    .format("flv")
    .output(`${STREAM_URL}/${STREAM_KEY}`)
    .on("start", () => {
      console.log("Transmissão iniciada.");
    })
    .on("error", (err) => {
      console.error("Erro na transmissão:", err.message);
    })
    .on("end", () => {
      console.log("Transmissão encerrada.");
    })
    .run();
};

// Função principal para baixar músicas, criar playlist e iniciar o streaming
const run = async () => {
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

// Agendar para rodar diariamente
setInterval(run, 1 * 60 * 60 * 1000); // Executa a cada 1 horas
run(); // Executa imediatamente na inicialização
