// Include global styles (*only* globals in this stylesheet)
require('./main.sass')

import Vue from 'vue'
import $ from 'jquery'

Vue.config.debug = DEBUG

new Vue(require('./app')).$mount('#app')

$(document).bind('touchmove', false)

require('fastclick').attach(document.body)

$('head').append(
	$('<link>').attr({
		rel: 'shortcut icon',
		href: require('../assets/img/favicon.png'),
	}),
	$('<link>').attr({
		rel: 'apple-touch-icon',
		href: require('../assets/img/apple-touch-icon-precomposed.png'),
	})
)
