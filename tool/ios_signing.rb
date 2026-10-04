#!/usr/bin/env ruby
# frozen_string_literal: true

# CI'da App hedefini elle (manual) imzalamaya çevirir; yalnızca App hedefine dokunur,
# Swift paketlerine (Capacitor) komut satırı geçersiz kılması uygulanmaz.
#
# Kullanım: ruby tool/ios_signing.rb <proje> <takim_id> <profil_adi> <bundle_id> <build_no> <surum>
require 'xcodeproj'

proje, takim, profil, bundle, build_no, surum = ARGV
abort 'Kullanım: ios_signing.rb <proje> <takim_id> <profil_adi> <bundle_id> <build_no> <surum>' unless surum

p = Xcodeproj::Project.open(proje)
hedef = p.targets.find { |t| t.name == 'App' } or abort 'App hedefi bulunamadı'
hedef.build_configurations.each do |c|
  s = c.build_settings
  abort "Bundle ID uyuşmuyor: #{s['PRODUCT_BUNDLE_IDENTIFIER']} != #{bundle}" unless s['PRODUCT_BUNDLE_IDENTIFIER'] == bundle
  s['CODE_SIGN_STYLE'] = 'Manual'
  s['DEVELOPMENT_TEAM'] = takim
  s['PROVISIONING_PROFILE_SPECIFIER'] = profil
  s['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
  s['CURRENT_PROJECT_VERSION'] = build_no
  s['MARKETING_VERSION'] = surum
end
attrs = p.root_object.attributes['TargetAttributes'] ||= {}
(attrs[hedef.uuid] ||= {})['ProvisioningStyle'] = 'Manual'
p.save
puts "İmzalama ayarlandı: #{bundle} · takım #{takim} · profil #{profil} · build #{build_no} · sürüm #{surum}"
