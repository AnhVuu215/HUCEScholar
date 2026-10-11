param([string[]]$DocumentNames = @('HUCEScholar_Project_Proposal', 'HUCEScholar_Use_Case_Specification'))
$ErrorActionPreference = 'Stop'
$docsRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $docsRoot 'deliverables'
$qaRoot = Join-Path $docsRoot '_qa'
$wordRenderer = $null
$wordDocument = $null
$renderResults = @()
try {
    $wordRenderer = New-Object -ComObject Word.Application
    $wordRenderer.Visible = $false
    $wordRenderer.DisplayAlerts = 0
    $wordRenderer.AutomationSecurity = 3
    foreach ($documentName in $DocumentNames) {
        $sourceDoc = Join-Path $outputRoot ($documentName + '.docx')
        $pdfPath = Join-Path $qaRoot ($documentName + '.pdf')
        $wordDocument = $wordRenderer.Documents.Open($sourceDoc, $false, $false)
        [void]$wordDocument.Fields.Update()
        for ($tocIndex = 1; $tocIndex -le $wordDocument.TablesOfContents.Count; $tocIndex++) {
            $wordDocument.TablesOfContents.Item($tocIndex).Update()
        }
        $wordDocument.Repaginate()
        [void]$wordDocument.Fields.Update()
        for ($tocIndex = 1; $tocIndex -le $wordDocument.TablesOfContents.Count; $tocIndex++) {
            $wordDocument.TablesOfContents.Item($tocIndex).UpdatePageNumbers()
        }
        $pageCount = $wordDocument.ComputeStatistics(2)
        $wordDocument.Save()
        $wordDocument.ExportAsFixedFormat($pdfPath, 17)
        $renderResults += [pscustomobject]@{Document=$sourceDoc; Pdf=$pdfPath; Pages=$pageCount; TocCount=$wordDocument.TablesOfContents.Count}
        $wordDocument.Close(0)
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($wordDocument)
        $wordDocument = $null
    }
    $renderResults | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $qaRoot 'word_render_report.json') -Encoding utf8
    $renderResults | ConvertTo-Json
} finally {
    if ($null -ne $wordDocument) {
        $wordDocument.Close(0)
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($wordDocument)
    }
    if ($null -ne $wordRenderer) {
        $wordRenderer.Quit()
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($wordRenderer)
    }
}
