<?php
/*
Plugin Name: ClickBloom Connector
Description: Connect your WordPress site to the ClickBloom web app for automated on-page SEO. Provides Dashboard, Activation, Settings, Logs, and a secure REST endpoint to apply or revert changes.
Version: 0.1.0
Author: ClickBloom
*/

if (!defined('ABSPATH')) { exit; }

define('CLICKBLOOM_VERSION', '0.1.0');
define('CLICKBLOOM_OPTION_KEY', 'clickbloom_options');
define('CLICKBLOOM_LOG_TABLE', 'clickbloom_logs');

// Environment guard: fail gracefully on old PHP
if (version_compare(PHP_VERSION, '7.2', '<')) {
  if (is_admin()) {
    add_action('admin_notices', function(){
      echo '<div class="notice notice-error"><p>ClickBloom requires PHP 7.2 or higher. Your server is running '.esc_html(PHP_VERSION).'. Please upgrade PHP to activate the plugin.</p></div>';
    });
  }
  return; // Stop loading the plugin
}

// Helpers
function clickbloom_get_options() {
  $defaults = [
    'api_key' => '',
    'activated' => false,
    'api_base' => '',
    'modules' => [
      'title' => false,
      'meta' => false,
      'image_alt' => false,
      'link_titles' => false,
      'schema' => false,
      'canonical' => false,
      'toggle_all' => false,
    ],
    'last_sync' => 0,
    'last_validate' => 0,
  ];
  $opt = get_option(CLICKBLOOM_OPTION_KEY, []);
  if (!is_array($opt)) $opt = [];
  // Deep merge
  $opt = array_merge($defaults, $opt);
  $opt['modules'] = array_merge($defaults['modules'], is_array($opt['modules']) ? $opt['modules'] : []);
  return $opt;
}

function clickbloom_update_options($opt){
  update_option(CLICKBLOOM_OPTION_KEY, $opt);
}

// Strict activation check against remote license (if configured)
function clickbloom_is_activated_strict(){
  $opt = clickbloom_get_options();
  if(empty($opt['api_key'])) return false;
  if(!empty($opt['api_base'])){
    $endpoint = rtrim($opt['api_base'],'/').'/api/license/validate';
    $body = wp_json_encode([ 'key'=>$opt['api_key'], 'site_url'=>home_url('/') ]);
    $res = wp_remote_post($endpoint, [ 'timeout'=>10, 'headers'=>['Content-Type'=>'application/json'], 'body'=>$body ]);
    if(is_wp_error($res)) return !empty($opt['activated']);
    $json = json_decode(wp_remote_retrieve_body($res), true);
    $valid = !empty($json['valid']);
    if(!$valid){ $opt['activated']=false; clickbloom_update_options($opt); }
    return $valid;
  }
  return !empty($opt['activated']);
}

// Shared top navigation tabs
function clickbloom_render_tabs($active){
  echo '<nav class="cr-tabs">';
  $tabs = [
    ['slug'=>'clickbloom','icon'=>'dashicons-dashboard','label'=>'Dashboard'],
    ['slug'=>'clickbloom-activation','icon'=>'dashicons-admin-network','label'=>'Activation'],
    ['slug'=>'clickbloom-settings','icon'=>'dashicons-admin-generic','label'=>'Settings'],
    ['slug'=>'clickbloom-logs','icon'=>'dashicons-clipboard','label'=>'Logs'],
  ];
  foreach($tabs as $t){
    $href = esc_url(admin_url('admin.php?page='.$t['slug']));
    $cls = $active===$t['slug'] ? 'cr-tab active' : 'cr-tab';
    echo '<a class="'.$cls.'" href="'.$href.'"><span class="dashicons '.$t['icon'].'"></span> '.$t['label'].'</a>';
  }
  echo '</nav>';
}

function clickbloom_log($action, $details = [], $post_id = null){
  global $wpdb; $table = $wpdb->prefix . CLICKBLOOM_LOG_TABLE;
  $wpdb->query($wpdb->prepare(
    "INSERT INTO {$table} (created_at, user_id, post_id, action, details) VALUES (NOW(), %d, %d, %s, %s)",
    get_current_user_id(), $post_id ? intval($post_id) : 0, sanitize_text_field($action), wp_json_encode($details)
  ));
}

// Activation: create logs table
register_activation_hook(__FILE__, function(){
  global $wpdb; $table = $wpdb->prefix . CLICKBLOOM_LOG_TABLE; $charset = $wpdb->get_charset_collate();
  require_once ABSPATH . 'wp-admin/includes/upgrade.php';
  $sql = "CREATE TABLE {$table} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    created_at DATETIME NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    post_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    action VARCHAR(191) NOT NULL,
    details LONGTEXT NULL,
    PRIMARY KEY (id),
    KEY created_at (created_at),
    KEY post_id (post_id)
  ) {$charset};";
  dbDelta($sql);
  // schedule weekly validation
  if(!wp_next_scheduled('clickbloom_validate_event')){
    wp_schedule_event(time()+3600, 'weekly', 'clickbloom_validate_event');
  }
});

register_deactivation_hook(__FILE__, function(){
  $ts = wp_next_scheduled('clickbloom_validate_event');
  if($ts) wp_unschedule_event($ts, 'clickbloom_validate_event');
});

add_filter('cron_schedules', function($s){
  if(!isset($s['weekly'])){
    $s['weekly'] = [ 'interval' => 7*24*3600, 'display' => __('Once Weekly') ];
  }
  return $s;
});

// Admin menu
add_action('admin_menu', function(){
  add_menu_page('ClickBloom', 'ClickBloom', 'manage_options', 'clickbloom', 'clickbloom_render_dashboard_v2', 'dashicons-chart-pie', 66);
  add_submenu_page('clickbloom', 'Dashboard', 'Dashboard', 'manage_options', 'clickbloom', 'clickbloom_render_dashboard_v2');
  add_submenu_page('clickbloom', 'Activation', 'Activation', 'manage_options', 'clickbloom-activation', 'clickbloom_render_activation');
  add_submenu_page('clickbloom', 'Settings', 'Settings', 'manage_options', 'clickbloom-settings', 'clickbloom_render_settings');
  add_submenu_page('clickbloom', 'Logs', 'Logs', 'manage_options', 'clickbloom-logs', 'clickbloom_render_logs');
});

add_action('admin_enqueue_scripts', function($hook){
  if (strpos($hook, 'clickbloom') !== false){
    // Ensure Dashicons are available for our icons
    wp_enqueue_style('dashicons');
    wp_enqueue_style('clickbloom-admin', plugins_url('admin.css', __FILE__), [], CLICKBLOOM_VERSION);
    wp_enqueue_script('clickbloom-admin', plugins_url('admin.js', __FILE__), [], CLICKBLOOM_VERSION, true);
  }
});

// Periodic validation when in admin
add_action('admin_init', function(){
  $opt = clickbloom_get_options();
  if(empty($opt['api_base']) || empty($opt['api_key'])) return;
  $last = intval(isset($opt['last_validate'])? $opt['last_validate'] : 0);
  if(time() - $last > 600){ // every 10 minutes
    clickbloom_run_validation(false);
  }
});

// Admin pages
function clickbloom_card_open(){ echo '<div class="cr-card">'; }
function clickbloom_card_close(){ echo '</div>'; }

// New dashboard UI (matches provided mock)
function clickbloom_render_dashboard_v2(){
  if(!current_user_can('manage_options')) return; $opt = clickbloom_get_options();
  // Validate quickly so the status reflects current state
  clickbloom_run_validation(true);

  $activated = clickbloom_is_activated_strict();
  $last_sync = !empty($opt['last_sync']) ? esc_html(date('Y-m-d H:i', intval($opt['last_sync']))) : 'Never';
  $endpoint = home_url('/wp-json/clickbloom/v1/update');
  $mods = isset($opt['modules']) && is_array($opt['modules']) ? $opt['modules'] : [];
  $active_count = 0; $total = 0; foreach($mods as $k=>$v){ if($k==='toggle_all') continue; $total++; if(!empty($v)) $active_count++; }

  echo '<div class="wrap">';
  // Header
  echo '<div class="cr-header">';
  echo '<div><h1 class="cr-title">Dashboard</h1><p class="cr-subtitle">Welcome back! Here\'s a quick overview of your integration.</p></div>';
  $sync_url = esc_url(admin_url('admin-post.php?action=clickbloom_sync&_wpnonce='.wp_create_nonce('clickbloom_sync')));
  $copy = esc_attr($endpoint);
  $key_copy_btn = '';
  if(!empty($opt['api_key'])){
    $key_copy_btn = ' <button type="button" class="cr-btn secondary cb-copy-key" data-copy="'.esc_attr($opt['api_key']).'"><span class="dashicons dashicons-admin-network"></span> Copy API Key</button>';
  }
  echo '<div class="cr-actions">'
      .'<a class="cr-btn" href="'.$sync_url.'"><span class="dashicons dashicons-update"></span> Sync Data from ClickBloom.ai</a>'
      .' <button type="button" class="cr-btn secondary cb-copy" data-copy="'.$copy.'"><span class="dashicons dashicons-admin-links"></span> Copy Endpoint URL</button>'
      . $key_copy_btn
      .'</div>';
  echo '</div>';

  // Tabs for navigation
  clickbloom_render_tabs('clickbloom');

  // KPI row (3 tiles)
  echo '<div class="cr-row">';
  echo '<div class="cr-kpi '.($activated? 'ok':'warn').'">'
      .'<div class="cr-ic"><span class="dashicons dashicons-yes"></span></div>'
      .'<div><div class="cr-label">Integration Status</div><div class="cr-value">'.($activated? 'Active':'Inactive').'</div></div>'
      .'</div>';
  echo '<div class="cr-kpi">'
      .'<div class="cr-ic"><span class="dashicons dashicons-admin-plugins"></span></div>'
      .'<div><div class="cr-label">Active Modules</div><div class="cr-value">'.$active_count.' / '.$total.'</div></div>'
      .'</div>';
  $wh_label = $activated ? 'Configured & Ready' : 'Not Configured';
  echo '<div class="cr-kpi '.($activated? 'ok':'warn').'">'
      .'<div class="cr-ic"><span class="dashicons dashicons-admin-links"></span></div>'
      .'<div><div class="cr-label">Webhook URL</div><div class="cr-value">'.$wh_label.'</div></div>'
      .'</div>';
  echo '</div>';

  // Body two columns
  echo '<div class="cr-grid-2">';
  // Getting Started
  echo '<div class="cr-card">';
  echo '<div class="cr-section-title">Getting Started</div>';
  echo '<p class="cr-p">Your WordPress site is now connected to ClickBloom.ai. Here\'s how to get the most out of our platform:</p>';
  echo '<ol class="cr-list">'
      .'<li><strong>Configure Your Settings</strong><br/>Visit the Settings tab to toggle on the specific SEO automations you want to use.</li>'
      .'<li><strong>Manage Optimizations on ClickBloom.ai</strong><br/>Log in to your ClickBloom.ai dashboard to manage pages, review AI suggestions, and push updates to your site.</li>'
      .'<li><strong>Monitor Activity</strong><br/>Use the Logs tab to see a transparent history of all updates sent from our platform to your website.</li>'
      .'</ol>';
  echo '</div>';

  // Quick Links
  echo '<div class="cr-card">';
  echo '<div class="cr-section-title">Quick Links</div>';
  echo '<div class="cr-links">';
  echo '<a class="cr-item" href="'.esc_url(admin_url('admin.php?page=clickbloom-activation')).'">'
      .'<div class="cr-ic"><span class="dashicons dashicons-admin-network"></span></div>'
      .'<div><div><strong>Manage API Key</strong></div><div class="cr-muted">Update your activation settings</div></div>'
      .'</a>';
  echo '<a class="cr-item" href="'.esc_url(admin_url('admin.php?page=clickbloom-settings')).'">'
      .'<div class="cr-ic"><span class="dashicons dashicons-admin-generic"></span></div>'
      .'<div><div><strong>Configure Settings</strong></div><div class="cr-muted">Choose which automations to enable</div></div>'
      .'</a>';
  echo '<a class="cr-item" href="'.esc_url(admin_url('admin.php?page=clickbloom-logs')).'">'
      .'<div class="cr-ic"><span class="dashicons dashicons-clipboard"></span></div>'
      .'<div><div><strong>View Activity Logs</strong></div><div class="cr-muted">See a history of recent changes</div></div>'
      .'</a>';
  echo '</div>';
  echo '</div>';
  echo '</div>'; // end grid-2

  // Small footer meta
  echo '<p class="cr-muted" style="margin-top:12px">Last Sync: '. $last_sync .' · Endpoint: <code>'. esc_html($endpoint) .'</code></p>';

  // Copy helpers now handled in admin.js

  echo '</div>'; // wrap
}

function clickbloom_render_dashboard(){
  if(!current_user_can('manage_options')) return; $opt = clickbloom_get_options();
  echo '<div class="wrap"><h1>ClickBloom — Dashboard</h1>';
  echo '<p class="cr-muted">Let\'s Improve Your Page Organic Traffic</p>';
  echo '<div class="cr-grid">';
  // Integration status
  // Perform a quick live validation to reflect accurate status
  clickbloom_run_validation(true);
  clickbloom_card_open();
  echo '<h2>Integration Status</h2>';
  $status = $opt['activated'] ? '<span class="cr-badge ok">Active</span>' : '<span class="cr-badge warn">Inactive</span>';
  echo '<p>Status: '.$status.'</p>';
  echo '<p>Last Sync: '.($opt['last_sync']? esc_html(date('Y-m-d H:i', intval($opt['last_sync']))) : 'Never').'</p>';
  echo '<p><a class="button button-primary" href="'.esc_url(admin_url('admin-post.php?action=clickbloom_sync&_wpnonce='.wp_create_nonce('clickbloom_sync'))).'">Sync Data from Web App</a> ';
  echo '<a class="button" href="'.esc_url(admin_url('admin-post.php?action=clickbloom_validate_now&_wpnonce='.wp_create_nonce('clickbloom_validate_now'))).'">Validate License Now</a></p>';
  clickbloom_card_close();
  // Getting started
  clickbloom_card_open();
  echo '<h2>Getting Started</h2>';
  echo '<ol class="cr-list"><li>Open Activation tab and paste your ClickBloom API Key.</li><li>Enable automation modules in Settings.</li><li>From the web app, connect this site using the same API key.</li></ol>';
  clickbloom_card_close();
  // Quick links
  clickbloom_card_open();
  echo '<h2>Quick Links</h2>';
  echo '<p><a href="'.esc_url(admin_url('admin.php?page=clickbloom-activation')).'">Manage API Key</a> · ';
  echo '<a href="'.esc_url(admin_url('admin.php?page=clickbloom-settings')).'">Configure Settings</a> · ';
  echo '<a href="'.esc_url(admin_url('admin.php?page=clickbloom-logs')).'">View Activity Logs</a></p>';
  clickbloom_card_close();
  echo '</div></div>';
}

function clickbloom_render_activation(){
  if(!current_user_can('manage_options')) return; $opt = clickbloom_get_options();
  echo '<div class="wrap">';
  clickbloom_render_tabs('clickbloom-activation');
  echo '<div class="cr-card">';
  echo '<div class="cr-section-title">Plugin Activation</div>';
  echo '<p class="cr-p cr-muted">Activate the plugin by entering your API key to connect your site to the ClickBloom.ai platform.</p>';
  echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'" style="margin-top:12px">';
  wp_nonce_field('clickbloom_activate');
  echo '<input type="hidden" name="action" value="clickbloom_activate" />';
  echo '<div class="cr-field">';
  echo '<label class="cr-label" for="cb_api_key">Your API Key</label>';
  echo '<input id="cb_api_key" class="cr-input" type="text" name="api_key" value="'.esc_attr($opt['api_key']).'" placeholder="CBL-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" />';
  echo '</div>';
  // Optional app API base (advanced)
  $api_base_val = esc_attr(isset($opt['api_base'])?$opt['api_base']:'');
  echo '<details style="margin-top:10px"><summary class="cr-muted">Advanced: App API Base (optional)</summary>';
  echo '<div class="cr-field"><label class="cr-label" for="cb_api_base">API Base</label><input id="cb_api_base" class="cr-input" type="url" name="api_base" value="'.$api_base_val.'" placeholder="https://app.example.com" /></div>';
  echo '</details>';
  $endpoint = home_url('/wp-json/clickbloom/v1/update');
  $copy = esc_attr($endpoint);
  echo '<div class="cr-actions-row" style="gap:10px">';
  echo '<button class="cr-btn secondary cb-copy" type="button" data-copy="'.$copy.'"><span class="dashicons dashicons-admin-links"></span> Copy Endpoint URL</button>';
  echo '<button class="cr-btn secondary cb-copy-key" type="button"><span class="dashicons dashicons-admin-network"></span> Copy API Key</button>';
  echo '<button class="cr-btn" type="submit"><span class="dashicons dashicons-admin-network"></span> Save & Activate Key</button>';
  echo '</div>';
  echo '</form>';
  echo '</div>';
  echo '</div>';
}

function clickbloom_render_settings(){
  if(!current_user_can('manage_options')) return; $opt = clickbloom_get_options(); $m=$opt['modules'];
  echo '<div class="wrap">';
  clickbloom_render_tabs('clickbloom-settings');
  echo '<div class="cr-card">';
  echo '<div class="cr-settings-head"><div class="cr-section-title">Automation Modules</div>';
  echo '<label class="cr-switch" title="Toggle All"><input id="cb_toggle_all" type="checkbox" '.checked($m['toggle_all'], true, false).'><span class="cr-slider"></span></label></div>';
  echo '<p class="cr-p cr-muted">Enable or disable specific automation features across your entire site.</p>';

  echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'" style="margin-top:12px">';
  wp_nonce_field('clickbloom_save_settings');
  echo '<input type="hidden" name="action" value="clickbloom_save_settings" />';
  echo '<input id="cb_toggle_all_hidden" type="hidden" name="toggle_all" value="'.($m['toggle_all']? '1':'').'" />';

  // Content & On-Page
  echo '<h3 style="margin-top:8px">Content & On-Page</h3>';
  // Title
  echo '<div class="cr-toggle-row">'
      .'<div class="cr-toggle-left">'
      .'<div class="cr-toggle-icon"><span class="dashicons dashicons-text"></span></div>'
      .'<div class="cr-toggle-text"><strong>Title Optimization</strong><small>Automatically generate and apply SEO-friendly page and post titles.</small></div>'
      .'</div>'
      .'<label class="cr-switch"><input type="checkbox" name="title" '.checked($m['title'], true, false).'><span class="cr-slider"></span></label>'
      .'</div>';
  // Meta
  echo '<div class="cr-toggle-row">'
      .'<div class="cr-toggle-left">'
      .'<div class="cr-toggle-icon"><span class="dashicons dashicons-edit"></span></div>'
      .'<div class="cr-toggle-text"><strong>Meta Description Optimization</strong><small>Automatically generate and apply SEO-friendly meta descriptions.</small></div>'
      .'</div>'
      .'<label class="cr-switch"><input type="checkbox" name="meta" '.checked($m['meta'], true, false).'><span class="cr-slider"></span></label>'
      .'</div>';
  // Image alts
  echo '<div class="cr-toggle-row">'
      .'<div class="cr-toggle-left">'
      .'<div class="cr-toggle-icon"><span class="dashicons dashicons-format-image"></span></div>'
      .'<div class="cr-toggle-text"><strong>Image Alt Text Generation</strong><small>Generate descriptive alt text for your images.</small></div>'
      .'</div>'
      .'<label class="cr-switch"><input type="checkbox" name="image_alt" '.checked($m['image_alt'], true, false).'><span class="cr-slider"></span></label>'
      .'</div>';
  // Link titles
  echo '<div class="cr-toggle-row">'
      .'<div class="cr-toggle-left">'
      .'<div class="cr-toggle-icon"><span class="dashicons dashicons-admin-links"></span></div>'
      .'<div class="cr-toggle-text"><strong>Automatic Link Titles</strong><small>Automatically add title attributes to links that are missing them.</small></div>'
      .'</div>'
      .'<label class="cr-switch"><input type="checkbox" name="link_titles" '.checked($m['link_titles'], true, false).'><span class="cr-slider"></span></label>'
      .'</div>';

  // Technical SEO
  echo '<h3 style="margin-top:10px">Technical SEO</h3>';
  // Schema
  echo '<div class="cr-toggle-row">'
      .'<div class="cr-toggle-left">'
      .'<div class="cr-toggle-icon"><span class="dashicons dashicons-editor-code"></span></div>'
      .'<div class="cr-toggle-text"><strong>Schema Markup Generation</strong><small>Apply structured data to your pages.</small></div>'
      .'</div>'
      .'<label class="cr-switch"><input type="checkbox" name="schema" '.checked($m['schema'], true, false).'><span class="cr-slider"></span></label>'
      .'</div>';
  // Canonical
  echo '<div class="cr-toggle-row">'
      .'<div class="cr-toggle-left">'
      .'<div class="cr-toggle-icon"><span class="dashicons dashicons-admin-multisite"></span></div>'
      .'<div class="cr-toggle-text"><strong>Canonical Tag Optimization</strong><small>Set the canonical URL for pages to prevent duplicate content issues.</small></div>'
      .'</div>'
      .'<label class="cr-switch"><input type="checkbox" name="canonical" '.checked($m['canonical'], true, false).'><span class="cr-slider"></span></label>'
      .'</div>';

  echo '<div class="cr-save-row"><button class="cr-btn" type="submit"><span class="dashicons dashicons-database"></span> Save Module Settings</button></div>';
  echo '</form>';
  // Toggle-All logic now handled in admin.js
  echo '</div>'; // card

  // Copy helpers now handled in admin.js

  // Danger zone card
  echo '<div class="cr-danger cr-card" style="margin-top:16px">';
  echo '<div class="cr-section-title" style="color:#b91c1c">Danger Zone</div>';
  echo '<p class="cr-muted">These are destructive actions. Please be certain before proceeding.</p>';
  echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'" style="margin-top:8px">';
  wp_nonce_field('clickbloom_revert_all');
  echo '<input type="hidden" name="action" value="clickbloom_revert_all" />';
  echo '<div style="display:flex; justify-content:space-between; align-items:center">'
      .'<div><strong>Revert All Changes</strong><div class="cr-muted">Remove all ClickBloom optimizations and revert posts/pages to their previous state.</div></div>'
      .'<button class="button button-primary" style="background:#dc2626;border-color:#b91c1c"><span class="dashicons dashicons-update-alt" style="vertical-align:middle"></span> Revert All</button>'
      .'</div>';
  echo '</form>';
  echo '</div>';

  echo '</div>'; // wrap
}

function clickbloom_render_logs(){
  if(!current_user_can('manage_options')) return; global $wpdb; $table = $wpdb->prefix . CLICKBLOOM_LOG_TABLE;
  $rows = $wpdb->get_results("SELECT * FROM {$table} ORDER BY id DESC LIMIT 200");
  echo '<div class="wrap">';
  clickbloom_render_tabs('clickbloom-logs');
  echo '<div class="cr-card">';
  echo '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">';
  echo '<div><div class="cr-section-title">Webhook Logs</div><div class="cr-muted">A record of the most recent events received from ClickBloom.ai.</div></div>';
  echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';
  wp_nonce_field('clickbloom_clear_logs');
  echo '<input type="hidden" name="action" value="clickbloom_clear_logs" />';
  echo '<button class="cr-btn-danger" type="submit"><span class="dashicons dashicons-trash"></span> Clear All Logs</button>';
  echo '</form>';
  echo '</div>';

  echo '<table class="cr-table"><thead><tr>'
      .'<th>TIMESTAMP</th><th>LEVEL</th><th>MESSAGE</th>'
      .'</tr></thead><tbody>';

  foreach($rows as $r){
    $time = esc_html($r->created_at);
    $level = 'info';
    // Derive a level when possible
    $d = json_decode($r->details, true);
    if(is_array($d) && isset($d['error'])){ $level = 'error'; }
    if(in_array($r->action, ['revert_all'])){ $level = 'warn'; }
    $cls = $level==='error'? 'cr-level-error' : ($level==='warn'? 'cr-level-warn' : 'cr-level-info');
    // Build a concise message
    $msg = '';
    $pid = intval($r->post_id);
    $view = '';
    if($pid){ $plink = get_permalink($pid); if($plink){ $view = ' <a class="cr-log-link" href="'.esc_url($plink).'" target="_blank" rel="noopener">View post</a>'; } }
    if($r->action==='update'){
      $keys = is_array($d)? implode(', ', array_keys($d)) : '';
      $msg = 'Updated '.($pid? ('post #'.$pid):'site').' '.($keys? ('fields: '.$keys):'');
    }elseif($r->action==='revert'){
      $keys = is_array($d)? implode(', ', array_keys($d)) : '';
      $msg = 'Reverted '.($pid? ('post #'.$pid):'post').' '.($keys? ('fields: '.$keys):'');
    }elseif($r->action==='revert_all'){
      $msg = 'Reverted all changes across the site';
    }elseif($r->action==='sync'){
      $msg = 'Manual sync triggered';
    }elseif($r->action==='activate'){
      $msg = !empty($d['activated']) ? 'Plugin activated' : 'Activation updated';
    }elseif($r->action==='save_settings'){
      $msg = 'Settings saved';
    }else{
      $msg = ucfirst($r->action);
    }
    echo '<tr>'
        .'<td>'. $time .'</td>'
        .'<td class="'. $cls .'">'. strtoupper($level) .'</td>'
        .'<td>'. esc_html($msg) . $view .'</td>'
        .'</tr>';
  }
  if(empty($rows)) echo '<tr><td colspan="3">No logs yet.</td></tr>';
  echo '</tbody></table>';
  echo '</div>'; // card
  echo '</div>'; // wrap
}

// Admin handlers
add_action('admin_post_clickbloom_activate', function(){
  if(!current_user_can('manage_options')) wp_die('Forbidden'); check_admin_referer('clickbloom_activate');
  $api = isset($_POST['api_key']) ? sanitize_text_field($_POST['api_key']) : '';
  $base = isset($_POST['api_base']) ? esc_url_raw($_POST['api_base']) : '';
  $opt = clickbloom_get_options();
  $opt['api_key'] = $api; $opt['api_base'] = $base;
  // Try remote activation if base provided; fall back to simple validation
  $activated = false;
  if($api && $base){
    $endpoint = rtrim($base,'/').'/api/license/activate';
    $body = wp_json_encode([ 'key'=>$api, 'site_url'=>home_url('/') ]);
    $res = wp_remote_post($endpoint, [ 'timeout'=>10, 'headers'=>['Content-Type'=>'application/json'], 'body'=>$body ]);
    if(!is_wp_error($res)){
      $code = wp_remote_retrieve_response_code($res);
      $json = json_decode(wp_remote_retrieve_body($res), true);
      if($code===200 && !empty($json['ok'])) $activated = true;
    }
  }
  if(!$activated){ $activated = (!empty($api) && strlen($api) > 12); }
  $opt['activated'] = $activated;
  clickbloom_update_options($opt);
  clickbloom_log('activate', ['activated'=>$activated]);
  wp_safe_redirect(admin_url('admin.php?page=clickbloom-activation&saved=1&activated=' . ($activated? '1':'0')));
  exit;
});

add_action('admin_post_clickbloom_save_settings', function(){
  if(!current_user_can('manage_options')) wp_die('Forbidden'); check_admin_referer('clickbloom_save_settings');
  $opt = clickbloom_get_options();
  $m = $opt['modules'];
  $m['toggle_all'] = isset($_POST['toggle_all']);
  $m['title'] = isset($_POST['title']);
  $m['meta'] = isset($_POST['meta']);
  $m['image_alt'] = isset($_POST['image_alt']);
  $m['link_titles'] = isset($_POST['link_titles']);
  $m['schema'] = isset($_POST['schema']);
  $m['canonical'] = isset($_POST['canonical']);
  if($m['toggle_all']){ foreach($m as $k=>$v){ if($k!=='toggle_all') $m[$k]=true; } }
  $opt['modules'] = $m; clickbloom_update_options($opt);
  clickbloom_log('save_settings', ['modules'=>$m]);
  wp_safe_redirect(admin_url('admin.php?page=clickbloom-settings&saved=1'));
  exit;
});

add_action('admin_post_clickbloom_sync', function(){
  if(!current_user_can('manage_options')) wp_die('Forbidden'); check_admin_referer('clickbloom_sync');
  $opt = clickbloom_get_options(); $opt['last_sync'] = time(); clickbloom_update_options($opt);
  // Optional: call remote app to pull data
  clickbloom_log('sync', ['user'=>get_current_user_id()]);
  wp_safe_redirect(admin_url('admin.php?page=clickbloom&synced=1'));
  exit;
});

// Manual validate
add_action('admin_post_clickbloom_validate_now', function(){
  if(!current_user_can('manage_options')) wp_die('Forbidden'); check_admin_referer('clickbloom_validate_now');
  clickbloom_run_validation(true);
  wp_safe_redirect(admin_url('admin.php?page=clickbloom&validated=1'));
  exit;
});

// Clear logs
add_action('admin_post_clickbloom_clear_logs', function(){
  if(!current_user_can('manage_options')) wp_die('Forbidden'); check_admin_referer('clickbloom_clear_logs');
  global $wpdb; $table = $wpdb->prefix . CLICKBLOOM_LOG_TABLE;
  $wpdb->query("TRUNCATE TABLE {$table}");
  wp_safe_redirect(admin_url('admin.php?page=clickbloom-logs&cleared=1'));
  exit;
});

add_action('admin_post_clickbloom_revert_all', function(){
  if(!current_user_can('manage_options')) wp_die('Forbidden'); check_admin_referer('clickbloom_revert_all');
  // Find posts with our backup meta and restore
  $q = new WP_Query(['post_type'=>'any','post_status'=>'any','meta_query'=>[['key'=>'clickbloom_backup','compare'=>'EXISTS']],'posts_per_page'=>500]);
  while($q->have_posts()){ $q->the_post(); $pid = get_the_ID();
    $backup = get_post_meta($pid, 'clickbloom_backup', true);
    if($backup){ $b = json_decode($backup, true); if(is_array($b)){
      if(isset($b['title'])){ wp_update_post(['ID'=>$pid, 'post_title'=>wp_strip_all_tags($b['title'])]); }
      if(isset($b['meta'])){ update_post_meta($pid, 'clickbloom_meta_description', sanitize_text_field($b['meta'])); update_post_meta($pid, '_yoast_wpseo_metadesc', sanitize_text_field($b['meta'])); }
      if(isset($b['canonical'])){ update_post_meta($pid, 'clickbloom_canonical', esc_url_raw($b['canonical'])); update_post_meta($pid, '_yoast_wpseo_canonical', esc_url_raw($b['canonical'])); }
      if(isset($b['schema'])){ update_post_meta($pid, 'clickbloom_schema', wp_json_encode($b['schema'])); }
      clickbloom_log('revert_all_post', ['restored'=>array_keys($b)], $pid);
    }}
  }
  wp_reset_postdata();
  clickbloom_log('revert_all');
  wp_safe_redirect(admin_url('admin.php?page=clickbloom-settings&reverted=1'));
  exit;
});

// REST API for web app
add_action('rest_api_init', function(){
  register_rest_route('clickbloom/v1', '/update', [
    'methods' => 'POST',
    'callback' => function(WP_REST_Request $req){
      $opt = clickbloom_get_options(); $token = sanitize_text_field($req['token']);
      if(!$opt['api_key'] || $token !== $opt['api_key']) return new WP_REST_Response(['ok'=>false,'error'=>'Unauthorized'], 401);
      // real-time validation if API base configured
      if(!empty($opt['api_base'])){
        $endpoint = rtrim($opt['api_base'],'/').'/api/license/validate';
        $body = wp_json_encode([ 'key'=>$opt['api_key'], 'site_url'=>home_url('/') ]);
        $res = wp_remote_post($endpoint, [ 'timeout'=>8, 'headers'=>['Content-Type'=>'application/json'], 'body'=>$body ]);
        if(!is_wp_error($res)){
          $json = json_decode(wp_remote_retrieve_body($res), true);
          if(empty($json['valid'])){
            $opt['activated'] = false; clickbloom_update_options($opt);
            return new WP_REST_Response(['ok'=>false,'error'=>'License invalid'], 401);
          }
        }
      }
      if(!$opt['activated']) return new WP_REST_Response(['ok'=>false,'error'=>'Not activated'], 401);
      $post_id = intval($req['postId']); $url = esc_url_raw($req['url']);
      if(!$post_id && $url){ $post_id = url_to_postid($url); }
      if(!$post_id) return new WP_REST_Response(['ok'=>false,'error'=>'Post not found'], 404);
      $changes = [];
      $backup = [
        'title' => get_post_field('post_title', $post_id),
        'meta' => get_post_meta($post_id, '_yoast_wpseo_metadesc', true) ?: get_post_meta($post_id, 'clickbloom_meta_description', true),
        'canonical' => get_post_meta($post_id, '_yoast_wpseo_canonical', true) ?: get_post_meta($post_id, 'clickbloom_canonical', true),
        'schema' => json_decode(get_post_meta($post_id, 'clickbloom_schema', true) ?: 'null', true),
      ];
      update_post_meta($post_id, 'clickbloom_backup', wp_json_encode($backup));

      if(isset($req['title'])){ $title = wp_strip_all_tags($req['title']); wp_update_post(['ID'=>$post_id, 'post_title'=>$title]); $changes['title']=$title; }
      if(isset($req['description'])){ $desc = sanitize_text_field($req['description']); update_post_meta($post_id, 'clickbloom_meta_description', $desc); update_post_meta($post_id, '_yoast_wpseo_metadesc', $desc); $changes['meta']=$desc; }
      if(isset($req['canonical'])){ $can = esc_url_raw($req['canonical']); update_post_meta($post_id, 'clickbloom_canonical', $can); update_post_meta($post_id, '_yoast_wpseo_canonical', $can); $changes['canonical']=$can; }
      if(isset($req['schema'])){ $schema = is_string($req['schema'])? $req['schema'] : wp_json_encode($req['schema']); update_post_meta($post_id, 'clickbloom_schema', $schema); $changes['schema']='updated'; }
      // Image alts: update attachment meta and attempt to update post content
      if(isset($req['images']) && is_array($req['images'])){
        $content = get_post_field('post_content', $post_id);
        foreach($req['images'] as $img){
          $src = isset($img['src']) ? esc_url_raw($img['src']) : '';
          $alt = isset($img['alt']) ? sanitize_text_field($img['alt']) : '';
          if(!$src || !$alt) continue;
          // attachment
          $aid = attachment_url_to_postid($src);
          if($aid){ update_post_meta($aid, '_wp_attachment_image_alt', $alt); }
          // content replace (best-effort)
          $quoted = preg_quote($src, '~');
          // replace existing alt
          $pattern = '~(<img[^>]*\bsrc=[\"\"][^\"\"]*'.$quoted.'[^\"\"]*[\"\"][^>]*\balt=[\"\"])([^\"\"]*)([\"\"])~i';
          $new = '$1'.esc_attr($alt).'$3';
          $count = 0; $content = preg_replace($pattern, $new, $content, 1, $count);
          if($count===0){
            // insert alt if missing
            $pattern2 = '~(<img[^>]*\bsrc=[\"\"][^\"\"]*'.$quoted.'[^\"\"]*[\"\"])([^>]*)(/?>)~i';
            $new2 = '$1$2 alt="'.esc_attr($alt).'"$3';
            $content = preg_replace($pattern2, $new2, $content, 1);
          }
        }
        wp_update_post([ 'ID'=>$post_id, 'post_content'=>$content ]);
        $changes['images']='updated';
      }
      clickbloom_log('update', $changes, $post_id);
      return new WP_REST_Response(['ok'=>true, 'postId'=>$post_id, 'applied'=>$changes], 200);
    },
    'permission_callback' => '__return_true'
  ]);

  // Settings update from the app (allows remote toggling of modules)
  register_rest_route('clickbloom/v1', '/settings', [
    'methods' => 'POST',
    'callback' => function(WP_REST_Request $req){
      $opt = clickbloom_get_options(); $token = sanitize_text_field($req['token']);
      if(!$opt['api_key'] || $token !== $opt['api_key']) return new WP_REST_Response(['ok'=>false,'error'=>'Unauthorized'], 401);
      if(!empty($opt['api_base'])){
        $endpoint = rtrim($opt['api_base'],'/').'/api/license/validate';
        $body = wp_json_encode([ 'key'=>$opt['api_key'], 'site_url'=>home_url('/') ]);
        $res = wp_remote_post($endpoint, [ 'timeout'=>8, 'headers'=>['Content-Type'=>'application/json'], 'body'=>$body ]);
        if(!is_wp_error($res)){
          $json = json_decode(wp_remote_retrieve_body($res), true);
          if(empty($json['valid'])){ $opt['activated']=false; clickbloom_update_options($opt); return new WP_REST_Response(['ok'=>false,'error'=>'License invalid'], 401); }
        }
      }
      if(!$opt['activated']) return new WP_REST_Response(['ok'=>false,'error'=>'Not activated'], 401);
      $mods = $opt['modules'];
      $body = $req->get_json_params();
      if(isset($body['modules']) && is_array($body['modules'])){
        foreach(['title','meta','image_alt','link_titles','schema','canonical'] as $k){ if(isset($body['modules'][$k])){ $mods[$k] = !!$body['modules'][$k]; } }
        if(isset($body['modules']['toggle_all'])){ $mods['toggle_all'] = !!$body['modules']['toggle_all']; if($mods['toggle_all']){ foreach($mods as $k=>$v){ if($k!=='toggle_all') $mods[$k]=true; } } }
      }
      $opt['modules'] = $mods; clickbloom_update_options($opt); clickbloom_log('save_settings', ['modules'=>$mods]);
      return new WP_REST_Response(['ok'=>true, 'modules'=>$mods], 200);
    },
    'permission_callback' => '__return_true'
  ]);

  // Lightweight ping to verify connectivity from the app
  register_rest_route('clickbloom/v1', '/ping', [
    'methods' => 'GET',
    'callback' => function(){ return new WP_REST_Response(['ok'=>true, 'site'=>home_url('/')], 200); },
    'permission_callback' => '__return_true'
  ]);
  register_rest_route('clickbloom/v1', '/revert', [
    'methods' => 'POST',
    'callback' => function(WP_REST_Request $req){
      $opt = clickbloom_get_options(); $token = sanitize_text_field($req['token']);
      if(!$opt['api_key'] || $token !== $opt['api_key']) return new WP_REST_Response(['ok'=>false,'error'=>'Unauthorized'], 401);
      if(!empty($opt['api_base'])){
        $endpoint = rtrim($opt['api_base'],'/').'/api/license/validate';
        $body = wp_json_encode([ 'key'=>$opt['api_key'], 'site_url'=>home_url('/') ]);
        $res = wp_remote_post($endpoint, [ 'timeout'=>8, 'headers'=>['Content-Type'=>'application/json'], 'body'=>$body ]);
        if(!is_wp_error($res)){
          $json = json_decode(wp_remote_retrieve_body($res), true);
          if(empty($json['valid'])){ $opt['activated']=false; clickbloom_update_options($opt); return new WP_REST_Response(['ok'=>false,'error'=>'License invalid'], 401); }
        }
      }
      if(!$opt['activated']) return new WP_REST_Response(['ok'=>false,'error'=>'Not activated'], 401);
      $post_id = intval($req['postId']); $url = esc_url_raw($req['url']); if(!$post_id && $url){ $post_id = url_to_postid($url); }
      if(!$post_id) return new WP_REST_Response(['ok'=>false,'error'=>'Post not found'], 404);
      $backup = get_post_meta($post_id, 'clickbloom_backup', true); if(!$backup) return new WP_REST_Response(['ok'=>false,'error'=>'No backup found'], 404);
      $b = json_decode($backup, true); if(!is_array($b)) return new WP_REST_Response(['ok'=>false,'error'=>'Invalid backup'], 400);
      if(isset($b['title'])){ wp_update_post(['ID'=>$post_id, 'post_title'=>wp_strip_all_tags($b['title'])]); }
      if(isset($b['meta'])){ update_post_meta($post_id, 'clickbloom_meta_description', sanitize_text_field($b['meta'])); update_post_meta($post_id, '_yoast_wpseo_metadesc', sanitize_text_field($b['meta'])); }
      if(isset($b['canonical'])){ update_post_meta($post_id, 'clickbloom_canonical', esc_url_raw($b['canonical'])); update_post_meta($post_id, '_yoast_wpseo_canonical', esc_url_raw($b['canonical'])); }
      if(isset($b['schema'])){ update_post_meta($post_id, 'clickbloom_schema', wp_json_encode($b['schema'])); }
      clickbloom_log('revert', $b, $post_id);
      return new WP_REST_Response(['ok'=>true], 200);
    },
    'permission_callback' => '__return_true'
  ]);

  // Provide plugin info and endpoints to the app
  register_rest_route('clickbloom/v1', '/info', [
    'methods' => 'GET',
    'callback' => function(){
      $opt = clickbloom_get_options();
      $active = clickbloom_is_activated_strict();
      return new WP_REST_Response([
        'ok' => true,
        'plugin' => 'clickbloom',
        'version' => CLICKBLOOM_VERSION,
        'site_url' => home_url('/'),
        'activated' => $active,
        'has_key' => !empty($opt['api_key']),
        'endpoints' => [
          'update' => home_url('/wp-json/clickbloom/v1/update'),
          'revert' => home_url('/wp-json/clickbloom/v1/revert'),
          'settings' => home_url('/wp-json/clickbloom/v1/settings'),
          'config' => home_url('/wp-json/clickbloom/v1/config'),
        ],
      ], 200);
    },
    'permission_callback' => '__return_true'
  ]);

  // Remote config from the app: set API base and finalize activation
  register_rest_route('clickbloom/v1', '/config', [
    'methods' => 'POST',
    'callback' => function(WP_REST_Request $req){
      $opt = clickbloom_get_options();
      $token = sanitize_text_field($req['token']);
      $api_base = esc_url_raw($req['api_base']);
      if(empty($token)) return new WP_REST_Response(['ok'=>false,'error'=>'Missing token'], 400);
      // If no key stored yet, accept and save this token as key
      if(empty($opt['api_key'])){ $opt['api_key'] = $token; }
      // Token must match stored key
      if($token !== $opt['api_key']) return new WP_REST_Response(['ok'=>false,'error'=>'Unauthorized'], 401);
      if(!empty($api_base)) $opt['api_base'] = $api_base;
      clickbloom_update_options($opt);
      // Try immediate validation if we have a base
      $valid = clickbloom_is_activated_strict();
      $opt = clickbloom_get_options(); $opt['activated'] = $valid; clickbloom_update_options($opt);
      clickbloom_log('config', ['api_base'=>$opt['api_base'], 'activated'=>$valid]);
      return new WP_REST_Response(['ok'=>true, 'activated'=>$valid], 200);
    },
    'permission_callback' => '__return_true'
  ]);
});

// Output meta/canonical/schema if our meta exists (as fallback)
add_action('wp_head', function(){
  if(is_admin()) return; global $post; if(!$post) return; $pid = $post->ID;
  $desc = get_post_meta($pid, 'clickbloom_meta_description', true);
  $can = get_post_meta($pid, 'clickbloom_canonical', true);
  $schema = get_post_meta($pid, 'clickbloom_schema', true);
  if($desc) echo '\n<meta name="description" content="'.esc_attr($desc).'" />\n';
  if($can) echo '\n<link rel="canonical" href="'.esc_url($can).'" />\n';
  if($schema){ echo '\n<script type="application/ld+json">'.wp_kses_post($schema).'</script>\n'; }
}, 9);

// Validation runner
function clickbloom_run_validation($manual=false){
  $opt = clickbloom_get_options();
  if(empty($opt['api_base']) || empty($opt['api_key'])) return;
  $endpoint = rtrim($opt['api_base'],'/').'/api/license/validate';
  $body = wp_json_encode([ 'key'=>$opt['api_key'], 'site_url'=>home_url('/') ]);
  $res = wp_remote_post($endpoint, [ 'timeout'=>10, 'headers'=>['Content-Type'=>'application/json'], 'body'=>$body ]);
  if(is_wp_error($res)) return;
  $json = json_decode(wp_remote_retrieve_body($res), true);
  $valid = !empty($json['valid']);
  if(!$valid){ $opt['activated']=false; }
  $opt['last_validate'] = time();
  clickbloom_update_options($opt);
}

add_action('clickbloom_validate_event', function(){ clickbloom_run_validation(false); });
