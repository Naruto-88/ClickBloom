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
  add_menu_page('ClickBloom', 'ClickBloom', 'manage_options', 'clickbloom', 'clickbloom_render_dashboard', 'dashicons-chart-pie', 66);
  add_submenu_page('clickbloom', 'Dashboard', 'Dashboard', 'manage_options', 'clickbloom', 'clickbloom_render_dashboard');
  add_submenu_page('clickbloom', 'Activation', 'Activation', 'manage_options', 'clickbloom-activation', 'clickbloom_render_activation');
  add_submenu_page('clickbloom', 'Settings', 'Settings', 'manage_options', 'clickbloom-settings', 'clickbloom_render_settings');
  add_submenu_page('clickbloom', 'Logs', 'Logs', 'manage_options', 'clickbloom-logs', 'clickbloom_render_logs');
});

add_action('admin_enqueue_scripts', function($hook){
  if (strpos($hook, 'clickbloom') !== false){
    wp_enqueue_style('clickbloom-admin', plugins_url('admin.css', __FILE__), [], CLICKBLOOM_VERSION);
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
  echo '<div class="wrap"><h1>Activation</h1>';
  echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';
  wp_nonce_field('clickbloom_activate');
  echo '<input type="hidden" name="action" value="clickbloom_activate" />';
  echo '<table class="form-table">';
  echo '<tr><th scope="row">ClickBloom API Key</th><td><input type="text" name="api_key" value="'.esc_attr($opt['api_key']).'" class="regular-text" placeholder="CBL-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"/></td></tr>';
  echo '<tr><th scope="row">API Base (optional)</th><td><input type="url" name="api_base" value="'.esc_attr(isset($opt['api_base'])?$opt['api_base']:'').'" class="regular-text" placeholder="https://app.example.com"/></td></tr>';
  echo '</table>';
  echo '<p><button class="button button-primary">Save & Activate</button></p>';
  echo '</form>';
  echo '</div>';
}

function clickbloom_render_settings(){
  if(!current_user_can('manage_options')) return; $opt = clickbloom_get_options(); $m=$opt['modules'];
  echo '<div class="wrap"><h1>Settings</h1>';
  echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';
  wp_nonce_field('clickbloom_save_settings');
  echo '<input type="hidden" name="action" value="clickbloom_save_settings" />';
  echo '<h2 class="cr-sub">Automation Modules</h2>';
  echo '<label class="cr-toggle"><input type="checkbox" name="toggle_all" '.checked($m['toggle_all'], true, false).'/> Toggle All</label>';
  echo '<div class="cr-grid-2">';
  echo '<div class="cr-card"><h3>Content & On-Page</h3>';
  echo '<label class="cr-toggle"><input type="checkbox" name="title" '.checked($m['title'], true, false).'/> Title Optimization</label>';
  echo '<label class="cr-toggle"><input type="checkbox" name="meta" '.checked($m['meta'], true, false).'/> Meta Description Optimization</label>';
  echo '<label class="cr-toggle"><input type="checkbox" name="image_alt" '.checked($m['image_alt'], true, false).'/> Image Alt Text Generation</label>';
  echo '<label class="cr-toggle"><input type="checkbox" name="link_titles" '.checked($m['link_titles'], true, false).'/> Automatic Link Titles</label></div>';
  echo '<div class="cr-card"><h3>Technical SEO</h3>';
  echo '<label class="cr-toggle"><input type="checkbox" name="schema" '.checked($m['schema'], true, false).'/> Schema Markup Generation</label>';
  echo '<label class="cr-toggle"><input type="checkbox" name="canonical" '.checked($m['canonical'], true, false).'/> Canonical Tag Optimization</label></div>';
  echo '</div>';
  echo '<p><button class="button button-primary">Save Module Settings</button></p>';
  echo '</form>';
  // Danger zone
  echo '<div class="cr-danger cr-card"><h3>Danger Zone</h3><p>These are destructive actions. Please be certain before proceeding.</p>';
  echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';
  wp_nonce_field('clickbloom_revert_all');
  echo '<input type="hidden" name="action" value="clickbloom_revert_all" />';
  echo '<p><button class="button button-secondary">Revert All Changes</button></p>';
  echo '</form></div>';
  echo '</div>';
}

function clickbloom_render_logs(){
  if(!current_user_can('manage_options')) return; global $wpdb; $table = $wpdb->prefix . CLICKBLOOM_LOG_TABLE;
  $rows = $wpdb->get_results("SELECT * FROM {$table} ORDER BY id DESC LIMIT 200");
  echo '<div class="wrap"><h1>Activity Logs</h1>';
  echo '<table class="widefat fixed striped"><thead><tr><th>Time</th><th>Post</th><th>Action</th><th>Details</th></tr></thead><tbody>';
  foreach($rows as $r){
    $time = esc_html($r->created_at);
    $post = $r->post_id ? ('<a href="'.esc_url(get_edit_post_link(intval($r->post_id))).'">#'.intval($r->post_id).'</a>') : '-';
    $action = esc_html($r->action);
    $details = esc_html($r->details);
    echo "<tr><td>{$time}</td><td>{$post}</td><td>{$action}</td><td><code>{$details}</code></td></tr>";
  }
  if(empty($rows)) echo '<tr><td colspan="4">No logs yet.</td></tr>';
  echo '</tbody></table></div>';
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
