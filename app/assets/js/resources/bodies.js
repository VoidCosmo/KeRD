export var bodies = {
	_atmDensity: 1.2230948554874,
	Kerbin: {
		name: 'Kerbin',
		radius: 600000,
		atmosphere: 70000,
		rotPeriod: 21600,
		atmosphereColor: 0x0077cc,
		atmosphereOpacity: 0.2,
		textures: {
			diffuse: require('../../../assets/img/maps/kerbin-diffuse.jpg'),
			specular: require('../../../assets/img/maps/kerbin-specular.png'),
			normal: require('../../../assets/img/maps/kerbin-normal.png'),
			biome: require('../../../assets/img/maps/kerbin-biome.jpg'),
		},
		attributes: {
			shininess: 30,
		},
	},
}

export var bodiesById = {
	1: bodies.Kerbin,
}
