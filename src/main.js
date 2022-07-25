const assert = require("assert");
const projectPath = process.env.INIT_CWD;
const hashlipsPath = `${__dirname}/..`;
const { NETWORK } = require(`${hashlipsPath}/constants/network.js`);
const fs = require("fs");
const sha1 = require('sha1');
const { createCanvas, loadImage } = require('canvas');
const {
  format,
  baseUri,
  description,
  background,
  uniqueDnaTorrance,
  layerConfigurations,
  rarityDelimiter,
  shuffleLayerConfigurations,
  debugLogs,
  extraMetadata,
  text,
  namePrefix,
  network,
  solanaMetadata,
  gif,
  renderImages,
  hookAfterDnaGenerated
} = require(`${hashlipsPath}/src/config.js`);

const buildDir = `${projectPath}/generated-files/hashlips-build`;
const defaultLayersDir = `${projectPath}/generated-files/hashlips-layers`;

const canvas = createCanvas(format.width, format.height);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = format.smoothing;
var _internalMetadataList = [];
var dnaList = new Set();
const DNA_DELIMITER = "---";
const HashlipsGiffer = require(`${hashlipsPath}/modules/HashlipsGiffer.js`);

let hashlipsGiffer = null;

const buildSetup = () => {
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true });
  }
  fs.mkdirSync(buildDir);
  fs.mkdirSync(`${buildDir}/json`);
  fs.mkdirSync(`${buildDir}/images`);
  if (gif.export) {
    fs.mkdirSync(`${buildDir}/gifs`);
  }
};

const getRarityWeight = (path, _str, customRarities) => {
  let nameWithoutExtension = _str.slice(0, -4);

  const layer = path.match(/([^\/]*)\/?$/)[1];

  if (customRarities) {
    if (customRarities[layer] === 'uniform') {
      return 1;
    }
    if (customRarities[layer] && customRarities[layer][nameWithoutExtension]) {
      assert(!isNaN(customRarities[layer][nameWithoutExtension]), `customRarities['${layer}']['${nameWithoutExtension}'] is not a number (${path})`);
      return customRarities[layer][nameWithoutExtension];
    } else {
      assert(0, `no rarity defined for: customRarities['${layer}']['${nameWithoutExtension}'] (${path})`);
    }
  }

  var nameWithoutWeight = Number(
    nameWithoutExtension.split(rarityDelimiter).pop()
  );
  if (isNaN(nameWithoutWeight)) {
    nameWithoutWeight = 1;
  }
  return nameWithoutWeight;
};

const cleanDna = (_str) => {
  const withoutOptions = removeQueryStrings(_str);
  var dna = Number(withoutOptions.split(":").shift());
  return dna;
};

const cleanName = (_str) => {
  let nameWithoutExtension = _str.slice(0, -4);
  var nameWithoutWeight = nameWithoutExtension.split(rarityDelimiter).shift();
  return nameWithoutWeight;
};

const getElements = (path, layerConfig) => {
  const elements = fs
    .readdirSync(path)
    .filter((item) => !/(^|\/)\.[^\/\.]/g.test(item))
    .map((i, index) => {
      if (i.includes("---")) {
        throw new Error(`layer name can not contain 3 dashes ("---"), please fix: ${i}`);
      }
      return {
        id: index,
        name: cleanName(i),
        filename: i,
        path: `${path}${i}`,
        weight: getRarityWeight(path, i, layerConfig.customRarities),
      };
    });
  const nameToElement = {};
  elements.forEach((element) => {
    nameToElement[element.name] = element;
  });

  return { elements, nameToElement };
};

const layersSetup = (layerConfig) => {
  const layers = layerConfig.layersOrder.map((layerObj, index) => {
    const {
      elements, nameToElement
    } = getElements(`${(layerConfig.layersDir ? `${projectPath}/${layerConfig.layersDir}` : '') || defaultLayersDir}/${layerObj.name}/`, layerConfig);
    return {
      id: index,
      elements,
      nameToElement,
      name:
        layerObj.options?.["displayName"] != undefined
          ? layerObj.options?.["displayName"]
          : layerObj.name,
      blend:
        layerObj.options?.["blend"] != undefined
          ? layerObj.options?.["blend"]
          : "source-over",
      opacity:
        layerObj.options?.["opacity"] != undefined
          ? layerObj.options?.["opacity"]
          : 1,
      bypassDNA:
        layerObj.options?.["bypassDNA"] !== undefined
          ? layerObj.options?.["bypassDNA"]
          : false,
    };
  });
  return layers;
};

const saveImage = (_editionCount) => {
  fs.writeFileSync(
    `${buildDir}/images/${_editionCount}.png`,
    canvas.toBuffer("image/png")
  );
};

const genColor = () => {
  let hue = Math.floor(Math.random() * 360);
  let pastel = `hsl(${hue}, 100%, ${background.brightness})`;
  return pastel;
};

const drawBackground = () => {
  ctx.fillStyle = background.static ? background.default : genColor();
  ctx.fillRect(0, 0, format.width, format.height);
};

const addMetadata = (_dna, _edition, attributesList) => {
  let dateTime = Date.now();
  let tempMetadata = {
    name: `${namePrefix} #${_edition}`,
    description: description,
    image: `${baseUri}/${_edition}.png`,
    dna: sha1(_dna),
    edition: _edition,
    date: dateTime,
    ...extraMetadata,
    attributes: attributesList,
    compiler: "HashLips Art Engine",
  };
  if (network == NETWORK.sol) {
    tempMetadata = {
      //Added metadata for solana
      name: tempMetadata.name,
      symbol: solanaMetadata.symbol,
      description: tempMetadata.description,
      //Added metadata for solana
      seller_fee_basis_points: solanaMetadata.seller_fee_basis_points,
      image: `${_edition}.png`,
      //Added metadata for solana
      external_url: solanaMetadata.external_url,
      edition: _edition,
      ...extraMetadata,
      attributes: tempMetadata.attributes,
      properties: {
        files: [
          {
            uri: `${_edition}.png`,
            type: "image/png",
          },
        ],
        category: "image",
        creators: solanaMetadata.creators,
      },
    };
  }
  return tempMetadata;
};

const loadLayerImg = async (_layer) => {
  try {
    return new Promise(async (resolve) => {
      const image = await loadImage(`${_layer.selectedElement.path}`);
      resolve({ layer: _layer, loadedImage: image });
    });
  } catch (error) {
    console.error("Error loading image:", error);
  }
};

const addText = (_sig, x, y, size) => {
  ctx.fillStyle = text.color;
  ctx.font = `${text.weight} ${size}pt ${text.family}`;
  ctx.textBaseline = text.baseline;
  ctx.textAlign = text.align;
  ctx.fillText(_sig, x, y);
};

const drawElement = (_renderObject, _index, _layersLen) => {
  ctx.globalAlpha = _renderObject.layer.opacity;
  ctx.globalCompositeOperation = _renderObject.layer.blend;
  text.only
    ? addText(
      `${_renderObject.layer.name}${text.spacer}${_renderObject.layer.selectedElement.name}`,
      text.xGap,
      text.yGap * (_index + 1),
      text.size
    )
    : ctx.drawImage(
      _renderObject.loadedImage,
      0,
      0,
      format.width,
      format.height
    );
};

const constructLayerToDna = (_dna = "", _layers = []) => {
  let mappedDnaToLayers = _layers.map((layer, index) => {
    let selectedElement = layer.elements.find(
      (e) => e.id == cleanDna(_dna.split(DNA_DELIMITER)[index])
    );
    return {
      name: layer.name,
      blend: layer.blend,
      opacity: layer.opacity,
      selectedElement: selectedElement,
    };
  });
  return mappedDnaToLayers;
};

/**
 * In some cases a DNA string may contain optional query parameters for options
 * such as bypassing the DNA isUnique check, this function filters out those
 * items without modifying the stored DNA.
 *
 * @param {String} _dna New DNA string
 * @returns new DNA string with any items that should be filtered, removed.
 */
const filterDNAOptions = (_dna) => {
  const dnaItems = _dna.split(DNA_DELIMITER);
  const filteredDNA = dnaItems.filter((element) => {
    const query = /(\?.*$)/;
    const querystring = query.exec(element);
    if (!querystring) {
      return true;
    }
    const options = querystring[1].split("&").reduce((r, setting) => {
      const keyPairs = setting.split("=");
      return { ...r, [keyPairs[0]]: keyPairs[1] };
    }, []);

    return options.bypassDNA;
  });

  return filteredDNA.join(DNA_DELIMITER);
};

/**
 * Cleaning function for DNA strings. When DNA strings include an option, it
 * is added to the filename with a ?setting=value query string. It needs to be
 * removed to properly access the file name before Drawing.
 *
 * @param {String} _dna The entire newDNA string
 * @returns Cleaned DNA string without querystring parameters.
 */
const removeQueryStrings = (_dna) => {
  const query = /(\?.*$)/;
  return _dna.replace(query, "");
};

const isDnaUnique = (_DnaList = new Set(), _dna = "") => {
  const _filteredDNA = filterDNAOptions(_dna);
  return !_DnaList.has(_filteredDNA);
};

const createDna = (_layers) => {
  let nft = {};
  let randNum = [];
  let nameToLayer = {};
  _layers.forEach((layer) => {
    nameToLayer[layer.name] = layer;
    var totalWeight = 0;
    layer.elements.forEach((element) => {
      totalWeight += element.weight;
    });
    // number between 0 - totalWeight
    let random = Math.floor(Math.random() * totalWeight);
    for (var i = 0; i < layer.elements.length; i++) {
      // subtract the current weight from the random weight until we reach a sub zero value.
      random -= layer.elements[i].weight;
      if (random < 0) {
        nft[layer.name] = layer.elements[i].name;
        return;
      }
    }
  });

  if (hookAfterDnaGenerated) {
    nft = hookAfterDnaGenerated(nft);
  }

  for (const [key, value] of Object.entries(nft)) {
    const layer = nameToLayer[key];
    const element = layer.nameToElement[value];
    assert(element, `Element ${value} not found in layer ${key}. ${JSON.stringify(layer.nameToElement)}`);
    randNum.push({
      id: element.id,
      filename: element.filename,
      bypassDNA: layer.bypassDNA,
    });
  }

  const dnaString = randNum
    .map(el =>
      `${el.id
      }:${el.filename
      }${el.bypassDNA ? "?bypassDNA=true" : ""
      }`
    )
    .join(DNA_DELIMITER);

  return dnaString;
};

const writeMetaData = (_data) => {
  fs.writeFileSync(`${buildDir}/metadata-full.json`, _data);
};

const saveMetaDataSingleFile = (metadata) => {
  debugLogs
    ? console.log(
      `Writing metadata for ${metadata.edition}: ${JSON.stringify(metadata)}`
    )
    : null;
  fs.writeFileSync(
    `${buildDir}/json/${metadata.edition}.json`,
    JSON.stringify(metadata, null, 2)
  );
};

function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

const startCreating = async () => {
  let layerConfigIndex = 0;
  let editionCount = 1;
  let failedCount = 0;
  let abstractedIndexes = [];
  for (
    let i = network == NETWORK.sol ? 0 : 1;
    i <= layerConfigurations[layerConfigurations.length - 1].growEditionSizeTo;
    i++
  ) {
    abstractedIndexes.push(i);
  }
  if (shuffleLayerConfigurations) {
    abstractedIndexes = shuffle(abstractedIndexes);
  }
  debugLogs
    ? console.log("Editions left to create: ", abstractedIndexes)
    : null;
  while (layerConfigIndex < layerConfigurations.length) {
    const layers = layersSetup(
      layerConfigurations[layerConfigIndex]
    );
    while (
      editionCount <= layerConfigurations[layerConfigIndex].growEditionSizeTo
    ) {
      let newDna = createDna(layers);
      if (isDnaUnique(dnaList, newDna)) {
        let results = constructLayerToDna(newDna, layers);
        let loadedElements = [];
        if (renderImages) {
          results.forEach((layer) => {
            loadedElements.push(loadLayerImg(layer));
          });
        } else {
          results.forEach((layer) => {
            loadedElements.push({ layer });
          });
        }

        await Promise.all(loadedElements).then((renderObjectArray) => {
          debugLogs ? console.log("Clearing canvas") : null;
          const attributesList = [];
          const _internalAttributeInfo = [];
          renderObjectArray.forEach(renderObject => {
            let selectedElement = renderObject.layer.selectedElement;
            attributesList.push({
              trait_type: renderObject.layer.name,
              value: selectedElement.name,
            });
            _internalAttributeInfo.push({
              trait_type: renderObject.layer.name,
              value: selectedElement.name,
              path: selectedElement.path
            });
          });
          if (renderImages) {
            ctx.clearRect(0, 0, format.width, format.height);
            if (gif.export) {
              hashlipsGiffer = new HashlipsGiffer(
                canvas,
                ctx,
                `${buildDir}/gifs/${abstractedIndexes[0]}.gif`,
                gif.repeat,
                gif.quality,
                gif.delay
              );
              hashlipsGiffer.start();
            }
            if (background.generate) {
              drawBackground();
            }
            renderObjectArray.forEach((renderObject, index) => {
              drawElement(
                renderObject,
                index,
                layerConfigurations[layerConfigIndex].layersOrder.length
              );
              if (gif.export) {
                hashlipsGiffer.add();
              }
            });
            if (gif.export) {
              hashlipsGiffer.stop();
            }
            debugLogs
              ? console.log("Editions left to create: ", abstractedIndexes)
              : null;
            saveImage(abstractedIndexes[0]);
          }
          const metadata = addMetadata(newDna, abstractedIndexes[0], attributesList);
          saveMetaDataSingleFile(metadata);
          _internalMetadataList.push({
            ...metadata,
            attributes: _internalAttributeInfo
          });
          console.log(
            `Created edition: ${abstractedIndexes[0]}, with DNA: ${sha1(
              newDna
            )}`
          );
        });
        dnaList.add(filterDNAOptions(newDna));
        editionCount++;
        abstractedIndexes.shift();
        failedCount = 0;
      } else {
        console.log("DNA exists!", failedCount);
        failedCount++;
        if (failedCount >= uniqueDnaTorrance) {
          console.log(
            `You need more layers or elements to grow your edition to ${layerConfigurations[layerConfigIndex].growEditionSizeTo} artworks! [layer config ${layerConfigIndex}]`
          );
          process.exit();
        }
      }
    }
    layerConfigIndex++;
  }
  writeMetaData(JSON.stringify(_internalMetadataList, null, 2));
};

module.exports = { startCreating, buildSetup };
