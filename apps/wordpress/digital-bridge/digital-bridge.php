<?php
/**
 * Plugin Name:       Digital Bridge Help Bar
 * Plugin URI:        https://github.com/ephrathasamuel/digital-bridge
 * Description:       Adds an Accessibility help bar to every form on your site: read fields aloud, answer by voice, type Amharic with English letters, and easier to see display options.
 * Version:           1.1.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       digital-bridge
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const DIGITAL_BRIDGE_VERSION = '1.1.0';
const DIGITAL_BRIDGE_OPTION  = 'digital_bridge_settings';

/** Saved settings with safe defaults. */
function digital_bridge_settings() {
	$defaults = array(
		'lang'     => 'en',
		'position' => 'right',
		'api'      => '',
	);
	$saved = get_option( DIGITAL_BRIDGE_OPTION, array() );
	return wp_parse_args( is_array( $saved ) ? $saved : array(), $defaults );
}

/** Adds the help bar script (shipped inside this plugin) to every front end page. */
function digital_bridge_enqueue() {
	$settings = digital_bridge_settings();
	$handle   = 'digital-bridge-assist';
	$config   = array(
		'lang'     => $settings['lang'],
		'position' => $settings['position'],
	);
	if ( '' !== $settings['api'] ) {
		$config['api'] = $settings['api'];
	}
	wp_register_script(
		$handle,
		plugins_url( 'assets/db-assist.js', __FILE__ ),
		array(),
		DIGITAL_BRIDGE_VERSION,
		array(
			'in_footer' => true,
			'strategy'  => 'defer',
		)
	);
	wp_add_inline_script( $handle, 'window.DigitalBridgeAssist = ' . wp_json_encode( $config ) . ';', 'before' );
	wp_enqueue_script( $handle );
}
add_action( 'wp_enqueue_scripts', 'digital_bridge_enqueue' );

/** Keeps only allowed values. */
function digital_bridge_sanitize( $input ) {
	$input = is_array( $input ) ? $input : array();
	$api   = isset( $input['api'] ) ? esc_url_raw( trim( (string) $input['api'] ), array( 'https' ) ) : '';
	return array(
		'lang'     => ( isset( $input['lang'] ) && in_array( $input['lang'], array( 'en', 'am', 'om', 'ti', 'so' ), true ) ) ? $input['lang'] : 'en',
		'position' => ( isset( $input['position'] ) && 'left' === $input['position'] ) ? 'left' : 'right',
		'api'      => $api,
	);
}

function digital_bridge_register_settings() {
	register_setting(
		'digital_bridge',
		DIGITAL_BRIDGE_OPTION,
		array(
			'type'              => 'array',
			'sanitize_callback' => 'digital_bridge_sanitize',
			'default'           => array(),
		)
	);
}
add_action( 'admin_init', 'digital_bridge_register_settings' );

function digital_bridge_menu() {
	add_options_page(
		__( 'Digital Bridge help bar', 'digital-bridge' ),
		__( 'Digital Bridge', 'digital-bridge' ),
		'manage_options',
		'digital-bridge',
		'digital_bridge_settings_page'
	);
}
add_action( 'admin_menu', 'digital_bridge_menu' );

function digital_bridge_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$settings = digital_bridge_settings();
	$name     = DIGITAL_BRIDGE_OPTION;
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Digital Bridge help bar', 'digital-bridge' ); ?></h1>
		<p><?php esc_html_e( 'The help bar is on: visitors see an Accessibility help button on every page. These settings are optional.', 'digital-bridge' ); ?></p>
		<form method="post" action="options.php">
			<?php settings_fields( 'digital_bridge' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="digital-bridge-lang"><?php esc_html_e( 'First language', 'digital-bridge' ); ?></label></th>
					<td>
						<select id="digital-bridge-lang" name="<?php echo esc_attr( $name ); ?>[lang]">
							<option value="en" <?php selected( $settings['lang'], 'en' ); ?>>English</option>
							<option value="am" lang="am" <?php selected( $settings['lang'], 'am' ); ?>>አማርኛ</option>
							<option value="om" lang="om" <?php selected( $settings['lang'], 'om' ); ?>>Afaan Oromoo</option>
							<option value="ti" lang="ti" <?php selected( $settings['lang'], 'ti' ); ?>>ትግርኛ</option>
							<option value="so" lang="so" <?php selected( $settings['lang'], 'so' ); ?>>Soomaali</option>
						</select>
						<p class="description"><?php esc_html_e( 'Visitors can change it in the bar.', 'digital-bridge' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="digital-bridge-position"><?php esc_html_e( 'Button position', 'digital-bridge' ); ?></label></th>
					<td>
						<select id="digital-bridge-position" name="<?php echo esc_attr( $name ); ?>[position]">
							<option value="right" <?php selected( $settings['position'], 'right' ); ?>><?php esc_html_e( 'Bottom right', 'digital-bridge' ); ?></option>
							<option value="left" <?php selected( $settings['position'], 'left' ); ?>><?php esc_html_e( 'Bottom left', 'digital-bridge' ); ?></option>
						</select>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="digital-bridge-api"><?php esc_html_e( 'Voice service (optional)', 'digital-bridge' ); ?></label></th>
					<td>
						<input id="digital-bridge-api" class="regular-text" type="url" name="<?php echo esc_attr( $name ); ?>[api]" value="<?php echo esc_attr( $settings['api'] ); ?>" placeholder="https://digital-bridge-api.onrender.com/api/v1" aria-describedby="digital-bridge-api-hint" />
						<p class="description" id="digital-bridge-api-hint"><?php esc_html_e( 'A Digital Bridge API address, used to read aloud in languages the visitor\'s device has no voice for. Leave empty to use device voices only; then nothing leaves the visitor\'s browser.', 'digital-bridge' ); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/** Settings link on the Plugins screen. */
function digital_bridge_action_links( $links ) {
	$url = admin_url( 'options-general.php?page=digital-bridge' );
	array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'digital-bridge' ) . '</a>' );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'digital_bridge_action_links' );
