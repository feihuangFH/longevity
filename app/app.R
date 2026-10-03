library(shiny)
library(dplyr)
library(shinyjs)
library(readxl)

# Base-R replacements for the handful of stringr functions this app used
# (str_extract, str_pad, str_to_title), to avoid pulling in stringr's heavy
# stringi dependency (~13MB) into the shinylive WebAssembly bundle.
extract_digits <- function(x) {
  r <- regexpr("\\d+", x)
  out <- rep(NA_character_, length(x))
  matched <- !is.na(r) & r > 0
  out[matched] <- regmatches(x, r)
  out
}

pad4 <- function(x) {
  ifelse(is.na(x), NA_character_, sprintf("%04d", suppressWarnings(as.integer(x))))
}

title_case <- function(x) {
  paste0(toupper(substring(x, 1, 1)), substring(x, 2))
}


# Load data
period_qx_table <- readRDS("period_qx_table.rds")
qx_cohort_ALT <- readRDS("cohort_ALT_qx_table.rds")

# ALT 2015-17 mortality improvement factors (125-year scenario, % per year, by
# gender and attained age). Negative values are reductions in mortality.
improvement_factors <- readRDS("improvement_factors_125.rds")

# Cohort qx for a person who is `start_age` in the 2016 base year, following the
# paper's construction: q_{x+k}(2016) * (1 + I_{x+k}/100)^k, where I is the ALT
# 2015-17 improvement factor at the attained age and k = years since `start_age`
# (so k = 0 at start_age), i.e. a person aged `start_age` in 2016. The factors
# are all zero or negative, so qx can only fall, and stays within [0, 1].
cohort_qx_from <- function(ages, qx_period, gender, start_age) {
  f <- improvement_factors[improvement_factors$gender == gender, ]
  imp <- f$IF[match(ages, f$age)]
  k <- ages - start_age
  qx_period * (1 + imp / 100)^k
}

# Compute life expectancy and death-age percentiles from a per-age qx vector,
# starting from an arbitrary age (instead of a fixed age-60 lookup table).
# Verified to reproduce the original precomputed age-60 tables exactly:
# curtate life expectancy + 0.5, and survival-curve interpolation for
# percentiles of age at death.
life_expectancy_from <- function(ages, qx, start_age) {
  keep <- ages >= start_age
  ages <- ages[keep]
  qx <- qx[keep]
  ord <- order(ages)
  ages <- ages[ord]
  qx <- qx[ord]

  px <- 1 - qx
  kpx <- cumprod(px)
  ex <- sum(kpx) + 0.5

  S <- c(1, kpx)
  ages_full <- c(start_age, ages + 1)

  find_quantile <- function(p_die) {
    target <- 1 - p_die
    idx <- which(S <= target)[1]
    if (is.na(idx)) return(NA_real_)
    if (idx == 1) return(ages_full[1])
    S1 <- S[idx - 1]; S2 <- S[idx]
    a1 <- ages_full[idx - 1]; a2 <- ages_full[idx]
    a1 + (S1 - target) / (S1 - S2) * (a2 - a1)
  }

  list(
    ex = ex,
    q20 = find_quantile(0.2),
    q50 = find_quantile(0.5),
    q80 = find_quantile(0.8)
  )
}


ALTFemale <- read_xlsx("Australian_Life_Tables_2015-17_Females.xlsx")
ALTMale <- read_xlsx("Australian_Life_Tables_2015-17_Males.xlsx")

ALTFemale <- ALTFemale %>% 
  select(x = Age, q = `...5`, m = `...6`, e = `...7`) %>% 
  mutate(Gender = "Female")

ALTMale <- ALTMale %>% 
  select(x = Age, q = `...5`, m = `...6`, e = `...7`) %>% 
  mutate(Gender = "Male")

ALT <- bind_rows(ALTFemale, ALTMale)
ALTdf <- ALT %>% rename(gender = Gender)

form_url <- "https://forms.office.com/Pages/ResponsePage.aspx?id=pM_2PxXn20i44Qhnufn7o2eKlYdc2aVLl1e_QJNzupJUNzZNQVVKNjNPRVZGVlc3NEQ4M1IyWVhMWS4u"

# Click/tap-to-reveal info icon (works on mobile, unlike hover-only title tooltips)
info_toggle <- function(id, label, text) {
  HTML(sprintf(
    '%s <span onclick="var e=document.getElementById(\'%s\'); e.style.display = (e.style.display===\'none\' ? \'block\' : \'none\');" style="cursor:pointer;font-size:16px;">&#9432;</span><div id="%s" style="display:none;font-size:14px;color:#555;margin:4px 0 4px 20px;">%s</div>',
    label, id, id, text
  ))
}

# Pramo made the relevant changes: postcode-to-IRSAD lookup for the Explorer tab.
postcode_irsad_lookup <- suppressWarnings(
  read_excel("IRSAD_indices.xlsx.xls",
             sheet = "Table 1",
             skip = 6,
             col_names = FALSE)
) %>%
  select(postcode_raw = 1, irsad_raw = 5) %>%
  mutate(
    postcode = pad4(extract_digits(as.character(postcode_raw))), # Pramo made the relevant changes
    IRSAD = paste0("D", as.integer(irsad_raw)) # Pramo made the relevant changes
  ) %>%
  filter(!is.na(postcode), IRSAD %in% paste0("D", 1:10)) %>%
  distinct(postcode, .keep_all = TRUE) %>%
  select(postcode, IRSAD)
# End Pramo Edit

# UI
ui <- fluidPage(
  useShinyjs(),  # Enables JavaScript (needed for runjs)
  tags$head(
    HTML("
    <!-- Google Analytics -->
    <script async src='https://www.googletagmanager.com/gtag/js?id=G-BZZL2WJJV6'></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-BZZL2WJJV6');
    </script>
  ")
  ),
  navbarPage(
    title = div(style = "font-weight: bold; font-size: 24px; color: #003366;",
                "Australian Longevity Explorer"),
  id = "main_tabs",  # <-- ADD THIS
  
  # div(
  #   style = "background-color: #e6f2ff; padding: 10px 20px; margin-bottom: 10px;",
  #   tags$h4("Explore how socio-economic factors shape life expectancy and retirement income in Australia.",
  #           style = "margin: 0; color: #003366; font-weight: normal;")
  # ),
  
  
  header = tags$head(
    tags$style(HTML("
    body {
      font-size: 20px;
    }
    h1, h2, h3, h4 {
      font-size: 26px;
      font-weight: bold;
    }
    .well {
      font-size: 20px;
    }
    label, .form-group label {
      font-size: 18px;
    }
    input, select {
      font-size: 18px;
    }
    .navbar-nav > li > a {
      font-size: 20px;
      font-weight: bold;
      color: #003366 !important;
    }
    .navbar-nav > li > a:hover {
      background-color: #e6f2ff !important;
      border-radius: 4px;
    }
.navbar-nav > .active > a {
  background-color: #f0f0f0 !important;
  color: #003366 !important;
  border-radius: 4px;
  font-weight: bold;
  border-bottom: 3px solid #003366;
}

  "))
  ),
  
  
  
  
  # Main Explorer Tab
  tabPanel("Explorer",
           sidebarPanel(
             selectInput("gender",  HTML('Sex 
          <a href="https://www.abs.gov.au/ausstats/abs@.nsf/Lookup/by%20Subject/2008.0~2016~Main%20Features~Sex~141" 
             target="_blank" 
             title="ABS definition of sex" 
             style="text-decoration: none; font-size: 16px;">&#9432;</a>'),
                 choices = c("Male", "Female")),

            radioButtons("geo_mode",
                         "Determine socio-economic status (IRSAD) by:",
                         choices = c("Postcode" = "postcode", "IRSAD Decile" = "irsad"),
                         selected = "postcode",
                         inline = TRUE
            ),

            conditionalPanel(
              condition = "input.geo_mode == 'postcode'",
              textInput("postcode", # Pramo made the relevant changes: postcode replaces direct IRSAD selection.
                        HTML('Postcode
                      <a href="https://www.abs.gov.au/AUSSTATS/abs@.nsf/DetailsPage/2033.0.55.0012016?OpenDocument"
                         target="_blank"
                         title="ABS SEIFA 2016 Table 1 maps Postal Area code to IRSAD decile."
                         style="text-decoration: none; font-size: 16px;">&#9432;</a>'),
                        value = "2000"
              ),
              htmlOutput("postcode_irsad_note") # Pramo made the relevant changes
            ),

            conditionalPanel(
              condition = "input.geo_mode == 'irsad'",
              selectInput("irsad_direct",
                          HTML('IRSAD Decile
          <a href="https://statmaps.abs.gov.au/portal/apps/mapviewer/index.html?layers=0475902f62444b0cb6b30e9a93bbb759"
             target="_blank"
             title="Open IRSAD map and find your IRSAD Rank within Australia - Decile"
             style="text-decoration: none; font-size: 16px;">&#9432;</a>'),
                         choices = paste0("D", 1:10),
                         selected = "D5"
              )
            ),

             selectInput("income",
                         HTML('Total Personal Weekly Income 
          <a href="https://www.abs.gov.au/census/guide-census-data/census-dictionary/2021/variables-topic/income-and-work/total-personal-income-weekly-incp" 
             target="_blank" 
             title="ABS definition of total personal weekly income" 
             style="text-decoration: none; font-size: 16px;">&#9432;</a>'),
                         choices = c("<499", "500-999", "1000+", "missing")
             ),
             
             selectInput("marital",
                         HTML('Marital Status 
        <a href="https://www.abs.gov.au/census/guide-census-data/census-dictionary/2021/variables-topic/household-and-families/registered-marital-status-mstp" 
           target="_blank" 
           title="ABS definition of registered marital status. Codes 1 to 4 and @ are classified as Single. Code 5 is classified as Married." 
           style="text-decoration: none; font-size: 16px;">&#9432;</a>'),
                         choices = c("Single", "Married")
             ),
             
             
             selectInput("home", 
                         HTML("Home Ownership 
        <a href=\"https://www.abs.gov.au/census/guide-census-data/census-dictionary/2021/variables-topic/housing/tenure-and-landlord-type-tenlld\" 
           target=\"_blank\" 
           title=\"ABS Tenure definition. Select 'Yes' if coded as 1 or 2.\" 
           style=\"text-decoration: none; font-size: 16px;\">&#9432;</a>"),
                         choices = c("No", "Yes", "missing")
             ),
             
             
             radioButtons("le_type", "Type of Life Expectancy:",
                          choiceNames = list(
                            info_toggle("cohort_info", "Cohort",
                                        "Life expectancy calculated from 2016–2017 mortality rates, adjusted for the Australian Government Actuary's assumed future mortality improvements, based on the long-term (125-year) trend in Australian death rates."),
                            info_toggle("period_info", "Period",
                                        "Life expectancy calculated from mortality rates observed during 2016–2017, assuming these rates remain unchanged in future.")
                          ),
                          choiceValues = c("cohort", "period"),
                          selected = "cohort"
             ),

             sliderInput("startAge",
                         "Life Expectancy at Age:",
                         min = 60,
                         max = 90,
                         value = 60,
                         step = 1
             ),

             # tags$div(
             #   style = "margin-top: 20px;",
             #   actionButton("impactBtn", "How did this tool help you?", icon = icon("comment"), 
             #                style = "color: white; background-color: #003366; font-size: 16px; padding: 10px 20px;")
             # )
             
           ),
             mainPanel(
               h4("Life Expectancy Summary"),
               wellPanel(htmlOutput("summaryExp")),
               
               actionButton("impactBtn", "How did this explorer help you?",
                            icon = icon("comment"),
                            style = "color: white; background-color: #003366; font-size: 16px; margin-top: 20px; margin-bottom: 20px;"),
               
               
               h4("Annual Probability of Death by Age (qx)"),
               wellPanel(
                 plotOutput("qxPlot"),
                 #dataTableOutput("qxTable")
               )
               
             )
           ),
  
   # About Tab
  tabPanel("About",
           fluidRow(
             column(10, offset = 1,
                    h3("About This Tool"),
                    p("This app helps Australians understand projected life expectancy based on socio-economic and demographic factors."),
                    p("It uses data from the Person Level Integrated Data Asset (PLIDA), accessed via the Australian Bureau of Statistics' DataLab. The life expectancies are computed based on the 2016-2017 census population with improvement factors of ALT2015-17 (125 year)."),
                    
                    h4("Related Publications"),
                    tags$ul(
                      tags$li(
                        "Huang, Fei; Hui, Francis; Villegas, Andrés (2025). ",
                        tags$a(href = "https://ssrn.com/abstract=5253598",
                               "Towards Fairer Retirement Outcomes: Socio-Economic Mortality Differentials in Australia",
                               target = "_blank"),
                        ". SSRN Working Paper."
                      ),
                      tags$li(
                        "Huang, Fei; Hui, Francis; Villegas, Andrés (2025). ",
                        tags$a(href = "https://doi.org/10.7910/DVN/C0HRDE",
                               "Australian Socio-economic Retiree Mortality 2016-17",
                               target = "_blank"),
                        ". Harvard Dataverse. https://doi.org/10.7910/DVN/C0HRDE."
                      ),
                      tags$li(
                        "Samarasinghe, Pramo; Huang, Fei; Hui, Francis; Villegas, Andrés (2026). ",
                        tags$a(
                          href = "https://content.actuaries.asn.au/resources/resource-ce6yyqn64sx3-786882053-16716",
                          "Incorporating Socio-economic Factors in Mortality Modelling",
                          target = "_blank"
                        ),
                        ". Actuaries Institute."
                      )
                    ),
                    
                    h4("Authors"),
                    p("Fei Huang, Francis Hui, Pramo Samarasinghe, and Andrés Villegas"),
                    p("Fei and Andrés are Associate Professors at the School of Risk and Actuarial Studies, UNSW Sydney. Francis is an Associate Professor at the Research School of Finance, Actuarial Studies, and Statistics, Australian National University. Pramo was an Honours student at the Australian National University and is now a research assistant at UNSW Sydney, who was the lead developer of the medical explorer."),
                    
                    h4("Acknowledgement"),
                    p("We thank the Australian Government Actuary Guy Thorburn and his team for their invaluable support in this project."),
                    
                    h4("Project Lead Contact"),
                    p("Fei Huang (", tags$a(href = "mailto:feihuang@unsw.edu.au", "feihuang@unsw.edu.au"), " | ",
                      tags$a(href = "https://www.feihuang.org", "www.feihuang.org", target = "_blank"), ")")
                    
             )
           )
  ),
  
  
  tabPanel("Download Data",
           fluidRow(
             column(8, offset = 2,
                    h3("Download Data"),
                    p("You can download the modelled period-based probability of death (qx) for ages 60–100, covering all socioeconomic
profiles below from the Harvard Dataverse: Australian Socio-economic
Mortality Dataverse."),
                    
                    tags$a(
                      href = "https://doi.org/10.7910/DVN/C0HRDE",  # 🔁 Replace this with your actual URL
                      target = "_blank",
                      class = "btn btn-primary btn-lg",
                      icon("download"),
                      " Download Dataset"
                    ),
                    
                    br(), br(),
                    #p(tags$small(""))
             )
           )
  ),
  
  
  # Feedback Tab
  tabPanel("Feedback",
           fluidRow(
             column(8, offset = 2,
                    h3("How Did This Help You?"),
                    p("We’re interested in understanding how this tool supports real-world decisions, insights, or research. Whether you're a retiree, policymaker, educator, student, advisor, or researcher — your experience helps us improve this tool and demonstrate its impact."),
                    
                    p("If this tool helped you explore a scenario, inform a conversation, support a policy submission, or improve your understanding of retirement outcomes, we’d love to hear your story."),
                    
                    p(tags$b("You can share as much or as little detail as you like."), "The form below is optional and anonymous unless you choose to include your name or email. With your consent, we may include anonymised stories in research reporting or impact assessments."),
                    wellPanel(
                      tags$iframe(
                        src = "https://forms.microsoft.com/Pages/ResponsePage.aspx?id=pM_2PxXn20i44Qhnufn7o2eKlYdc2aVLl1e_QJNzupJUNzZNQVVKNjNPRVZGVlc3NEQ4M1IyWVhMWS4u",
                        width = "100%",
                        height = "650",
                        style = "border: none; overflow: hidden;",
                        frameborder = "0",
                        allowfullscreen = NA
                      )
                    )
             )
           )
  )
)
)

  
server <- function(input, output, session) {
  
  # Pramo made the relevant changes: derive IRSAD internally from postcode.
  # Extended to also allow direct IRSAD decile selection, bypassing postcode lookup.
  postcode_irsad <- reactive({
    if (identical(input$geo_mode, "irsad")) {
      return(list(postcode = NA_character_,
                  IRSAD = if (is.null(input$irsad_direct)) "D5" else input$irsad_direct,
                  found = TRUE))
    }

    postcode_digits <- extract_digits(if (is.null(input$postcode)) "" else input$postcode)
    postcode <- ifelse(
      is.na(postcode_digits),
      "",
      pad4(postcode_digits)
    )

    match <- postcode_irsad_lookup %>%
      filter(postcode == !!postcode) %>%
      slice(1)

    if (nrow(match) == 0) {
      list(postcode = postcode, IRSAD = "D1", found = FALSE)
    } else {
      list(postcode = postcode, IRSAD = match$IRSAD[[1]], found = TRUE)
    }
  })

  # Pramo made the relevant changes: show the postcode-derived IRSAD value.
  output$postcode_irsad_note <- renderUI({
    derived <- postcode_irsad()

    if (derived$found) {
      HTML(paste0(
        "<span style='font-size: 14px; color: #555;'>",
        "The IRSAD value for the relevant postcode is: <strong>",
        derived$IRSAD,
        "</strong>.</span>"
      ))
    } else {
      HTML(
        "<span style='font-size: 14px; color: #9a3412;'>Postcode not found in ABS SEIFA 2016 Table 1; using IRSAD D1 until a valid postcode is entered.</span>"
      )
    }
  })
  
  profile_filter <- reactive({
    list(
      gender = input$gender,
      IRSAD = postcode_irsad()$IRSAD, # Pramo made the relevant changes: model still receives D1-D10 internally.
      income = input$income,
      marital = input$marital,
      home = input$home
    )
  })
  
  # Period qx for the selected profile (always period; the cohort basis is
  # built from it below so improvement can restart at the selected age).
  period_qx_profile <- reactive({
    p <- profile_filter()
    period_qx_table %>%
      filter(gender == p$gender,
             IRSAD == p$IRSAD,
             income == p$income,
             marital == p$marital,
             home == p$home)
  })

  output$summaryExp <- renderUI({
    qx_df <- period_qx_profile()
    start_age <- input$startAge

    qx_used <- if (input$le_type == "cohort") {
      cohort_qx_from(qx_df$age, qx_df$qx, profile_filter()$gender, start_age)
    } else {
      qx_df$qx
    }

    result <- life_expectancy_from(qx_df$age, qx_used, start_age)

    # Plain-language wording. Ages are rounded (so "About ..."), and nothing is
    # shown above 100: the mortality model is fitted to data only up to age 100,
    # and anyone who lives beyond it is an open-ended group, not a fixed end point.
    yrs <- paste0("2016", intToUtf8(8211), "2017")   # en dash built in code to keep the source ASCII
    ex_txt <- if (result$ex >= 10) as.character(round(result$ex)) else sprintf("%.1f", result$ex)

    # share = "1 in 5" or "half"; a = the age at which that share is reached
    die_line <- function(share, a) {
      if (a >= 100) {
        paste0("Fewer than ", share, " die before age 100")
      } else {
        paste0("About ", share, " die before age ", round(a))
      }
    }
    live_line <- function(share, a) {
      if (a >= 100) {
        paste0("At least ", share, " live to age 100 or older")
      } else if (round(a) >= 100) {
        paste0("About ", share, " live to age 100 or older")
      } else {
        paste0("About ", share, " live beyond age ", round(a))
      }
    }

    # Same definitions as the information notes beside the Cohort / Period options.
    basis_note <- if (input$le_type == "cohort") {
      paste0("Cohort basis: the figures above are calculated from ", yrs, " mortality rates, adjusted for ",
             "the Australian Government Actuary's assumed future mortality improvements, based on the ",
             "long-term (125-year) trend in Australian death rates.")
    } else {
      paste0("Period basis: the figures above are calculated from mortality rates observed during ", yrs,
             ", assuming these rates remain unchanged in future.")
    }

    tags$div(
      tags$p(
        style = "font-size: 24px; font-weight: bold; margin-bottom: 6px;",
        paste0("At age ", start_age, ", life expectancy is about ", ex_txt, " more years.")
      ),
      tags$p(paste0("Life expectancy is an average, and ages at death vary widely. Of every 100 people ",
                    "with these characteristics who are alive at age ", start_age, ":")),
      tags$ul(
        tags$li(die_line("1 in 5", result$q20)),
        tags$li(die_line("half", result$q50)),
        tags$li(live_line("1 in 5", result$q80))
      ),
      if (result$q50 >= 100 || result$q80 >= 100) {
        tags$p(style = "font-size: 16px; color: #555;",
               "The data used extend only to age 100, so estimates beyond that are less certain.")
      },
      tags$p(
        style = "font-size: 15px; color: #555; margin-top: 12px; margin-bottom: 0;",
        "This describes a group of people with the selected characteristics, not a prediction for any one person. ",
        "It does not take account of individual health or lifestyle. ", basis_note
      )
    )
  })
  
  # Mortality curve shown in the chart. The cohort curve is for people aged 60 in
  # 2016, built from the period qx with the same function as the summary above.
  qx_profile <- reactive({
    qx_df <- period_qx_profile()
    if (input$le_type == "cohort") {
      qx_df$qx <- cohort_qx_from(qx_df$age, qx_df$qx, profile_filter()$gender, 60)
    }
    qx_df
  })
  
  output$qxPlot <- renderPlot({
    alt_label <- "ALT 2015–17"

    qx_model <- qx_profile() %>%
      mutate(source = ifelse(input$le_type == "cohort",
                             "Modelled Probability of Death (cohort)",
                             "Modelled Probability of Death (period)"))

    qx_plot_data <- if (input$le_type == "period") {
      qx_alt <- ALTdf %>%
        filter(gender == input$gender) %>%
        rename(age = x, qx = q) %>%
        mutate(source = alt_label)

      bind_rows(qx_model, qx_alt)
    } else {
      qx_model
    }

    qx_plot_data <- qx_plot_data %>% filter(age >= 60, age <= 105)

    color_map <- c(
      "Modelled Probability of Death (cohort)" = "#003366",
      "Modelled Probability of Death (period)" = "#CC0033"
    )
    color_map <- c(color_map, setNames("black", alt_label))
    present_sources <- names(color_map)[names(color_map) %in% unique(qx_plot_data$source)]

    y_max <- max(qx_plot_data$qx, na.rm = TRUE)
    y_ticks <- pretty(c(0, y_max))

    op <- par(mar = c(5, 6.5, 4, 2) + 0.1, cex.main = 1.4, cex.lab = 1.2, cex.axis = 1.1)
    on.exit(par(op))

    plot(NA, NA, xlim = c(60, 105), ylim = range(y_ticks),
         xlab = "", ylab = "",
         main = paste(title_case(input$le_type), "Mortality Curve (qx)"),
         yaxt = "n", bty = "l")
    title(xlab = "Age", line = 2.2, cex.lab = 1.2)
    title(ylab = "Annual probability of death (qx)", line = 4.5, cex.lab = 1.2)
    axis(2, at = y_ticks, labels = paste0(format(y_ticks * 100, nsmall = 2), "%"), las = 1)

    for (s in present_sources) {
      d <- qx_plot_data %>% filter(source == s) %>% arrange(age)
      lines(d$age, d$qx, col = color_map[[s]], lwd = 2.5)
    }

    legend("topleft", legend = present_sources,
           col = color_map[present_sources], lwd = 2.5,
           bty = "n", cex = 1, seg.len = 1.5)
  })
  
  observeEvent(input$impactBtn, {
    updateNavbarPage(session, inputId = "main_tabs", selected = "Feedback")
  })
}


shinyApp(ui, server)
