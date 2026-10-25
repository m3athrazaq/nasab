package com.m3athrazaq.nasab;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // the app's own plugins: reading the backup or GEDCOM file the user picks or opens with the app,
        // printing the PDF tree, book and certificate, and keeping the WebView on the app's own pages
        registerPlugin(FileImportPlugin.class);
        registerPlugin(PdfPrintPlugin.class);
        registerPlugin(NavigationGuardPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
