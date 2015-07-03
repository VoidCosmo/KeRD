import $ from 'jquery'
import THREE from 'three'
import TWEEN from 'tween'
import {wrapDegDelta, debounce, deg2rad, spherical2cartesian, orbitalElements2Cartesian, objScreenPosition} from 'utils'
import {bodies} from 'resources/bodies'

require('imports?THREE=three!three.maskpass')
require('imports?THREE=three!three.copyshader')
require('imports?THREE=three!three.effectcomposer')
require('imports?THREE=three!three.renderpass')
require('imports?THREE=three!three.shaderpass')
require('babel!imports?THREE=three!three.crtshader')

var sin = Math.sin
var asin = Math.asin
var sqrt = Math.sqrt
var pow = Math.pow

var renderer
var scene
var camera

var apoapsisNode
var periapsisNode

export default {
	inherit: true,
	template: require('./template.jade')({styles: require('./stylesheet.sass')}),
	props: ['module-config'],
	data() {
		var origo = new THREE.Vector3(0, 0, 0)
		return {
			// Camera properties
			displayRadius: 50,
			displayRatio: 0,
			cameraRho: 200, // distance
			cameraPhi: 0, // initial horizontal angle
			cameraTheta: 90, // initial vertical angle
			cameraFov: 50,
			cameraMargin: 220,

			focus: null,
			showAtmosphere: true,
			showBiome: false,

			objects: {},
			focusPosition: origo,
			origo: origo,

			loading: true,
			body: null,
		}
	},
	ready() {
		apoapsisNode = $('.nodes .apoapsis')
		periapsisNode = $('.nodes .periapsis')

		// Create scene and setup camera and lights
		scene = new THREE.Scene()
		camera = new THREE.PerspectiveCamera(this.cameraFov, 1, 0.01, 120000)

		scene.add(new THREE.AmbientLight(0x777777))

		// Add sun light
		var sunPosition = new THREE.Vector3(0, 0, -40000)
		var light = new THREE.DirectionalLight(0xffffff, 2)
		light.position.copy(sunPosition)
		scene.add(light)

		if (this.config.rendering.shadows) {
			var shadowLight = new THREE.SpotLight(0xffffff, 1, 1)
			shadowLight.position.copy(new THREE.Vector3(0, 0, -500))
			shadowLight.castShadow = true
			shadowLight.onlyShadow = true
			shadowLight.exponent = 0
			shadowLight.shadowDarkness = 0.5
			shadowLight.shadowCameraFar = 800
			shadowLight.shadowCameraFov = 40
			scene.add(shadowLight)
		}

		// Add celestial body
		var bodyGeometry = new THREE.SphereGeometry(this.displayRadius, 32, 32)
		var bodyMaterial = new THREE.MeshPhongMaterial()
		bodyMaterial.normalScale = new THREE.Vector2(1.5, 1.5)
		this.objects.bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial)
		this.objects.bodyMesh.castShadow = true
		this.objects.bodyMesh.receiveShadow = true
		scene.add(this.objects.bodyMesh)

		// Add atmosphere indicator
		var atmosphereGeometry = new THREE.SphereGeometry(1, 32, 32)
		var atmosphereMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 })
		atmosphereMaterial.transparent = true
		atmosphereMaterial.opacity = 0
		this.objects.atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
		scene.add(this.objects.atmosphereMesh)

		// Add vessel geometry
		var vesselGeometry = new THREE.SphereGeometry(2.5, 16, 16)
		var vesselMaterial = new THREE.MeshPhongMaterial({ color: 0x770000 })
		this.objects.vesselMesh = new THREE.Mesh(vesselGeometry, vesselMaterial)
		this.objects.vesselMesh.castShadow = true
		this.objects.vesselMesh.receiveShadow = true
		scene.add(this.objects.vesselMesh)

		// Add apoapsis/periapsis geometry
		this.objects.apoapsisMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00aa00, visible: false }))
		this.objects.periapsisMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00aa00, visible: false }))
		scene.add(this.objects.apoapsisMesh)
		scene.add(this.objects.periapsisMesh)

		// Add vessel line (from body center, indicating altitude)
		var lineGeometry = new THREE.Geometry()
		var lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 })
		var lineMesh = new THREE.Line(lineGeometry, lineMaterial)
		lineMesh.castShadow = true
		lineMesh.receiveShadow = true
		lineMesh.frustumCulled = false

		lineGeometry.vertices.push(new THREE.Vector3(0, 0, 0))
		lineGeometry.vertices.push(new THREE.Vector3(0, 0, 0))

		scene.add(lineMesh)

		// Add orbit ellipse
		var orbitLineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff })
		var orbitLinePath = new THREE.CurvePath()
		orbitLinePath.add(new THREE.EllipseCurve(0, 0, 1, 1, 0, 2 * Math.PI, false))
		var orbitLineGeometry = orbitLinePath.createPointsGeometry(256)
		orbitLineGeometry.computeTangents()
		var orbitLineMesh = new THREE.Line(orbitLineGeometry, orbitLineMaterial)
		orbitLineMesh.frustumCulled = false
		orbitLineMesh.rotation.order = 'YXZ'

		scene.add(orbitLineMesh)

		// Add optional lens flare
		if (this.config.rendering.lensFlare) {
			var lensFlareTexture0 = THREE.ImageUtils.loadTexture(require('../../../assets/img/textures/lensflare/lensflare0.png'))
			var lensFlareTexture2 = THREE.ImageUtils.loadTexture(require('../../../assets/img/textures/lensflare/lensflare2.png'))
			var lensFlareTexture3 = THREE.ImageUtils.loadTexture(require('../../../assets/img/textures/lensflare/lensflare3.png'))

			var lensFlare = new THREE.LensFlare(lensFlareTexture0, 400, 0.0, THREE.AdditiveBlending, new THREE.Color(0xffffff))

			lensFlare.add(lensFlareTexture2, 512, 0.0, THREE.AdditiveBlending)
			lensFlare.add(lensFlareTexture2, 512, 0.0, THREE.AdditiveBlending)
			lensFlare.add(lensFlareTexture2, 512, 0.0, THREE.AdditiveBlending)
			lensFlare.add(lensFlareTexture3, 60, 0.6, THREE.AdditiveBlending)
			lensFlare.add(lensFlareTexture3, 70, 0.7, THREE.AdditiveBlending)
			lensFlare.add(lensFlareTexture3, 120, 0.9, THREE.AdditiveBlending)
			lensFlare.add(lensFlareTexture3, 70, 1.0, THREE.AdditiveBlending)
			lensFlare.position.copy(light.position)

			lensFlare.customUpdateCallback = function(object) {
				var flare
				var vecX = -object.positionScreen.x * 2
				var vecY = -object.positionScreen.y * 2

				for (var f = 0; f < object.lensFlares.length; f += 1) {
					flare = object.lensFlares[ f ]

					flare.x = object.positionScreen.x + vecX * flare.distance
					flare.y = object.positionScreen.y + vecY * flare.distance

					flare.rotation = 0
				}

				object.lensFlares[ 2 ].y += 0.025
				object.lensFlares[ 3 ].rotation = object.positionScreen.x * 0.5 + THREE.Math.degToRad( 45 )
			}

			scene.add(lensFlare)
		}

		// Add optional skybox
		if (this.config.rendering.skybox) {
			var skyboxGeometry = new THREE.SphereGeometry(100000, 32, 32)
			var skyboxMap = THREE.ImageUtils.loadTextureCube([
				require('../../../assets/img/textures/skybox/posx.jpg'),
				require('../../../assets/img/textures/skybox/negx.jpg'),
				require('../../../assets/img/textures/skybox/posy.jpg'),
				require('../../../assets/img/textures/skybox/negy.jpg'),
				require('../../../assets/img/textures/skybox/posz.jpg'),
				require('../../../assets/img/textures/skybox/negz.jpg'),
			])
			skyboxMap.format = THREE.RGBFormat
			var skyboxMaterial = new THREE.MeshBasicMaterial({
				envMap: skyboxMap,
			})
			skyboxMaterial.side = THREE.BackSide
			var skyboxMesh = new THREE.Mesh(skyboxGeometry, skyboxMaterial)

			scene.add(skyboxMesh)
		}

		// Init renderer
		renderer = new THREE.WebGLRenderer({
			alpha: true,
		})
		renderer.setSize(1, 1)
		$('.mod-map .orbital-display').append(renderer.domElement)

		renderer.shadowMapEnabled = true
		renderer.shadowMapType = THREE.PCFShadowMap
		renderer.setPixelRatio(window.devicePixelRatio)

		// Resize renderer when window is resized
		function resize() {
			var $dim = $('.mod-map .orbital-display').width()
			renderer.setSize($dim, $dim)
			$('.mod-map .orbital-display').css({
				width: `${$dim}px`,
				height: `${$dim}px`,
			})
		}
		$(window).on('resize', debounce(resize))
		resize()

		// Camera rotation handlers
		var dragging
		var dragOffsetX = 0
		var dragOffsetY = 0

		var dragMultiplier = 0.5 // drag degrees multiplier per px movement
		var zoomMultiplier = 40 // zoom distance multiplier per mouse scroll

		$(document).on('mouseup', () => {
			dragging = false
		})
		$(renderer.domElement).on('mousedown', (ev) => {
			ev.preventDefault()
			dragging = true

			dragOffsetX = ev.pageX
			dragOffsetY = ev.pageY
		})
		$(renderer.domElement).on('mousemove', (ev) => {
			ev.preventDefault()

			if (!dragging) {
				return
			}

			this.cameraPhi += deg2rad((ev.pageX - dragOffsetX) * dragMultiplier)
			this.cameraTheta -= deg2rad((ev.pageY - dragOffsetY) * dragMultiplier)

			this.rotateCamera()

			dragOffsetX = ev.pageX
			dragOffsetY = ev.pageY
		})
		$(renderer.domElement).on('mousewheel', (ev) => {
			ev.preventDefault()
			var delta = ev.originalEvent.wheelDelta / 120
			delta = delta >= 1 ? 1 : -1
			var rho = -delta * zoomMultiplier

			this.cameraRho += rho
			if (this.cameraRho < 20) {
				this.cameraRho = 20
			}
			if (this.cameraRho > 800) {
				this.cameraRho = 800
			}

			this.rotateCamera()
		})

		this.rotateCamera()

		// Optional post-processing
		if (this.config.rendering.postProcessing) {
			var postprocessClock = new THREE.Clock()
			var composer = new THREE.EffectComposer(renderer)
			var copyPass = new THREE.ShaderPass(THREE.CopyShader)
			composer.addPass(new THREE.RenderPass(scene, camera))

			var crtEffect = new THREE.ShaderPass(THREE.CRTShader)
			composer.addPass(crtEffect)
			crtEffect.uniforms.iResolution.value = new THREE.Vector3(500, 500, 0)

			composer.addPass(copyPass)
			copyPass.renderToScreen = true
		}

		// Animate callback
		var animate = () => {
			setTimeout(() => {
				requestAnimationFrame(animate)
			}, 1000 / this.config.rendering.fps)

			TWEEN.update()

			if (this.config.rendering.postProcessing) {
				crtEffect.uniforms.iGlobalTime.value += postprocessClock.getDelta()
				composer.render()
			}
			else {
				renderer.render(scene, camera)
			}
		}
		requestAnimationFrame(animate)

		// Tweening
		var argumentOfPeriapsis = 0
		var eccentricity = 0
		var epoch = 0
		var inclination = 0
		var longitudeOfAscendingNode = 0
		var semimajorAxis = 0
		var trueAnomaly = 0

		var body = {}

		var vesselTweenProperties
		var vesselTween

		this.toggleFocus('vessel')

		this.$watch(() => this.loading, () => {
			// Show noise when loading
			if (this.config.rendering.postProcessing) {
				crtEffect.uniforms.noise.value = this.loading ? 1 : 0
			}
		}, { immediate: true })

		this.$watch(() => this.data['v.long'] + this.data['v.lat'] + this.data['o.ApA'] + this.data['v.body'], () => {
			body = bodies[this.data['v.body']]
			this.displayRatio = (this.displayRadius / body.radius)
			this.body = body

			this.refreshBodyMaterials()
			this.rotateCamera()

			// Animate vessel and camera positions
			vesselTweenProperties = {
				trueAnomaly: trueAnomaly,
				inclination: inclination,
				argumentOfPeriapsis: argumentOfPeriapsis,
			}
			vesselTween = new TWEEN.Tween(vesselTweenProperties).to({
				// Add normalized delta values to current values
				trueAnomaly: trueAnomaly + wrapDegDelta(this.data['o.trueAnomaly'] - trueAnomaly),
				inclination: inclination + wrapDegDelta(this.data['o.inclination'] - inclination),
				argumentOfPeriapsis: argumentOfPeriapsis + wrapDegDelta(this.data['o.argumentOfPeriapsis'] - argumentOfPeriapsis),
			}, this.config.telemachus.refreshInterval)

			argumentOfPeriapsis = this.data['o.argumentOfPeriapsis']
			eccentricity = this.data['o.eccentricity']
			epoch = this.data['o.epoch']
			inclination = this.data['o.inclination']
			longitudeOfAscendingNode = this.data['o.lan']
			semimajorAxis = this.data['o.sma']
			trueAnomaly = this.data['o.trueAnomaly']

			// Rotate body correctly in relation to Kerbol
			// This appears to work correctly even without further calculations
			this.objects.bodyMesh.rotation.y = deg2rad(((epoch / body.rotPeriod) * 360))

			// Draw orbit ellipse
			// http://stackoverflow.com/questions/19432633/how-do-i-draw-an-ellipse-with-svg-based-around-a-focal-point-instead-of-the-cen
			var rx = this.displayRatio * semimajorAxis
			var ry = this.displayRatio * (semimajorAxis * (sqrt(1 - pow(eccentricity, 2))))
			var cx = sqrt(pow(rx, 2) - pow(ry, 2))
			var cy = 0

			orbitLinePath = new THREE.CurvePath()
			orbitLinePath.add(new THREE.EllipseCurve(cx, cy, rx, ry, 0, 2 * Math.PI, false))
			orbitLineGeometry = orbitLinePath.createPointsGeometry(256)
			orbitLineGeometry.computeTangents()

			orbitLineMesh.geometry.vertices = orbitLineGeometry.vertices
			orbitLineMesh.geometry.verticesNeedUpdate = true

			orbitLineMesh.rotation.y = deg2rad(longitudeOfAscendingNode)
			orbitLineMesh.rotation.x = -deg2rad(90 - inclination)
			orbitLineMesh.rotation.z = -asin(sin(deg2rad(argumentOfPeriapsis)))

			vesselTween.onUpdate(() => {
				// Calculate orbital position
				var apoapsisPosition = orbitalElements2Cartesian(this.displayRatio, 180, eccentricity, semimajorAxis, vesselTweenProperties.inclination, longitudeOfAscendingNode, vesselTweenProperties.argumentOfPeriapsis)
				var periapsisPosition = orbitalElements2Cartesian(this.displayRatio, 0, eccentricity, semimajorAxis, vesselTweenProperties.inclination, longitudeOfAscendingNode, vesselTweenProperties.argumentOfPeriapsis)

				this.objects.apoapsisMesh.position.x = apoapsisPosition.x
				this.objects.apoapsisMesh.position.y = apoapsisPosition.z
				this.objects.apoapsisMesh.position.z = -apoapsisPosition.y

				this.objects.periapsisMesh.position.x = periapsisPosition.x
				this.objects.periapsisMesh.position.y = periapsisPosition.z
				this.objects.periapsisMesh.position.z = -periapsisPosition.y

				// Update vessel position
				var vesselPosition = orbitalElements2Cartesian(
					this.displayRatio,
					vesselTweenProperties.trueAnomaly,
					eccentricity,
					semimajorAxis,
					vesselTweenProperties.inclination,
					longitudeOfAscendingNode,
					vesselTweenProperties.argumentOfPeriapsis)

				// NOTE: coordinates are swapped to match the game's coordinate system
				this.objects.vesselMesh.position.x = vesselPosition.x
				this.objects.vesselMesh.position.y = vesselPosition.z
				this.objects.vesselMesh.position.z = -vesselPosition.y

				// Update indicator line from center to vessel
				lineGeometry.vertices[1].copy(this.objects.vesselMesh.position)
				lineGeometry.verticesNeedUpdate = true
			})
			vesselTween.start()
		})
	},
	methods: {
		refreshBodyMaterials(force=false) {
			var bodyMaterial = this.objects.bodyMesh.material
			var atmosphereMaterial = this.objects.atmosphereMesh.material

			if (!bodyMaterial.map || bodyMaterial.map.sourceFile !== this.body.textures.diffuse || force) {
				// Update textures based on the current body
				// Only updates if the current texture source files differs from the current body
				bodyMaterial.map = THREE.ImageUtils.loadTexture(this.body.textures.diffuse, undefined, () => {
					this.loading = false
				})
				bodyMaterial.map.anisotropy = renderer.getMaxAnisotropy()

				if (this.config.rendering.specularMaps && this.body.textures.specular) {
					bodyMaterial.specularMap = THREE.ImageUtils.loadTexture(this.body.textures.specular)
					bodyMaterial.specularMap.anisotropy = renderer.getMaxAnisotropy() / 2
					bodyMaterial.shininess = this.body.attributes.shininess
				}
				else {
					bodyMaterial.shininess = 0
				}

				if (this.config.rendering.normalMaps && this.body.textures.normal) {
					bodyMaterial.normalMap = THREE.ImageUtils.loadTexture(this.body.textures.normal)
					bodyMaterial.normalMap.anisotropy = renderer.getMaxAnisotropy() / 2
				}

				bodyMaterial.needsUpdate = true

				// Update atmosphere appearance on the current body
				atmosphereMaterial.color.setHex(this.body.atmosphereColor)
				atmosphereMaterial.opacity = this.body.atmosphereOpacity
				atmosphereMaterial.colorsNeedUpdate = true
			}

			// Resize atmosphere mesh
			if (this.body.atmosphere) {
				var scale = (this.body.radius + this.body.atmosphere) * this.displayRatio
				this.objects.atmosphereMesh.scale.x = scale
				this.objects.atmosphereMesh.scale.y = scale
				this.objects.atmosphereMesh.scale.z = scale
			}

		},
		rotateCamera(rho, phi, theta) {
			var coords = spherical2cartesian(rho || this.cameraRho, phi || this.cameraPhi, theta || this.cameraTheta)
			camera.position.x = this.focusPosition.x + coords.x
			camera.position.y = this.focusPosition.y + coords.y
			camera.position.z = this.focusPosition.z + coords.z
			camera.lookAt(this.focusPosition)
			camera.updateMatrixWorld()

			var apoapsis2DCoords = objScreenPosition(this.objects.apoapsisMesh, camera, renderer)
			var periapsis2DCoords = objScreenPosition(this.objects.periapsisMesh, camera, renderer)

			apoapsisNode.css({
				left: `${apoapsis2DCoords.x}px`,
				top: `${apoapsis2DCoords.y}px`,
			})
			periapsisNode.css({
				left: `${periapsis2DCoords.x}px`,
				top: `${periapsis2DCoords.y}px`,
			})
		},
		toggleFocus() {
			if (this.focus === 'vessel') {
				this.focus = 'body'
				this.focusPosition = this.origo
			}
			else {
				this.focus = 'vessel'
				this.focusPosition = this.objects.vesselMesh.position
			}
			this.rotateCamera()
		},
		toggleAtmosphere() {
			this.showAtmosphere = !this.showAtmosphere
			this.objects.atmosphereMesh.visible = this.showAtmosphere
		},
		toggleBiome() {
			this.showBiome = !this.showBiome
			var material = this.objects.bodyMesh.material

			if (this.showBiome) {
				// Fix texture offset present in all the biome maps
				var biomeTexture = THREE.ImageUtils.loadTexture(this.body.textures.biome)
				biomeTexture.offset.x = -0.25
				biomeTexture.wrapS = THREE.RepeatWrapping

				material.map = biomeTexture
				material.shininess = 0
				material.specularMap = undefined
				material.normalMap = undefined
				material.needsUpdate = true
			}
			else {
				this.refreshBodyMaterials(true)
			}
		},
	},
}
