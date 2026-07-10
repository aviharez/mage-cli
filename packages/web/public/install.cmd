@echo off
:: Mage installer — Windows cmd wrapper
:: Double-click this file or run it from cmd to install Mage.
:: Requires PowerShell 5+ (ships with Windows 10/11).
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://mage.apps.ocpdevgra.dti.co.id/install.ps1 | iex"
