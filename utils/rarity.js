const basePath = process.env.INIT_CWD;
const fs = require("fs");

const { layerConfigurations } = require(`${basePath}/config.js`).hashlips;

let rawdata = fs.readFileSync(
  `${basePath}/generated-files/hashlips-build/metadata-full.json`
);
let data = JSON.parse(rawdata);
let editionSize = data.length;

let rarityData = [];

for (const { attributes } of data) {
  for (const attr of attributes) {
    attr.value = attr.value.split("#")[0];
  }
}

const cache = {};
function getElementsByName(layerName) {
  if (cache[layerName]) {
    return cache[layerName];
  }
  let elements = [];
  let already = {};
  for (const { attributes } of data) {
    for (const { trait_type, value } of attributes) {
      const clean = value.split("#")[0];
      if (already[clean]) {
        continue;
      }
      if (layerName != trait_type) {
        continue;
      }
      elements.push({ name: clean });
      already[clean] = true;
    }
  }
  return (cache[layerName] = elements);
}

// intialize layers to chart
layerConfigurations.forEach((config) => {
  let layers = config.layersOrder;

  layers.forEach((layer) => {
    // get elements for each layer
    let elementsForLayer = [];
    let elements = getElementsByName(layer?.options?.displayName ?? layer.name);
    elements.forEach((element) => {
      // just get name and weight for each element
      let rarityDataElement = {
        trait: element.name,
        occurrence: 0, // initialize at 0
      };
      elementsForLayer.push(rarityDataElement);
    });
    let layerName =
      layer.options?.["displayName"] != undefined
        ? layer.options?.["displayName"]
        : layer.name;
    // don't include duplicate layers
    if (!rarityData.includes(layer.name)) {
      // add elements for each layer to chart
      rarityData[layerName] = elementsForLayer;
    }
  });
});

// fill up rarity chart with occurrences from metadata
data.forEach((element) => {
  let attributes = element.attributes;
  attributes.forEach((attribute) => {
    let traitType = attribute.trait_type;
    let value = attribute.value;

    let rarityDataTraits = rarityData[traitType];
    rarityDataTraits.forEach((rarityDataTrait) => {
      if (rarityDataTrait.trait == value) {
        // keep track of occurrences
        rarityDataTrait.occurrence++;
      }
    });
  });
});

// convert occurrences to occurence string
for (var layer in rarityData) {
  for (var attribute in rarityData[layer]) {
    // get chance
    let chance = (
      (rarityData[layer][attribute].occurrence / editionSize) *
      100
    ).toFixed(2);

    // show two decimal places in percent
    rarityData[layer][
      attribute
    ].occurrence = `${rarityData[layer][attribute].occurrence} (${chance} %)`;
  }
}

// print out rarity data
for (var layer in rarityData) {
  console.log(`Trait type: ${layer}`);
  for (var trait in rarityData[layer]) {
    console.log(
      `  ${rarityData[layer][trait].trait}: ${rarityData[layer][trait].occurrence}`
    );
  }
  console.log();
}

// console.log(rarityData)
